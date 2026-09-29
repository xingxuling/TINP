import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GuardedMcpRegistry} from '../src/guarded-mcp-registry.mjs';

const binding=JSON.parse(fs.readFileSync(new URL('./fixtures/opp-mcp-workspace-read-binding.json',import.meta.url),'utf8'));
const policy={
  allowedEffects:['filesystem.read'],
  filesystemPrefixes:['workspace/project'],
  acceptedReversibility:['reversible'],
};

function provider(counter){
  return async request=>{
    counter.calls++;
    return {
      mcp:{content:[{type:'text',text:'ok'}],structuredContent:{text:'ok'},isError:false},
      observation:{effects:['filesystem.read'],resources:{filesystem:[request.arguments.path]}},
    };
  };
}

test('registry exposes only rooted MCP tool descriptors and routes through gateway',async()=>{
  const counter={calls:0};
  const registry=new GuardedMcpRegistry({entries:[{
    binding,providerCall:provider(counter),authorityScopes:['workspace.read'],policy,
  }]});
  assert.deepEqual(registry.listTools(),[binding.mcpTool]);
  const security=registry.securityDescriptor('workspace.read');
  assert.equal(security.bindingRoot,binding.bindingRoot);
  assert.equal(security.authorityGranted,false);
  const receipt=await registry.callTool({name:'workspace.read',arguments:{path:'workspace/project/readme.md'}});
  assert.equal(receipt.status,'VERIFIED');
  assert.equal(counter.calls,1);
});

test('unregistered tool never reaches a provider',async()=>{
  const counter={calls:0};
  const registry=new GuardedMcpRegistry({entries:[{
    binding,providerCall:provider(counter),authorityScopes:['workspace.read'],policy,
  }]});
  await assert.rejects(
    ()=>registry.callTool({name:'shell.exec',arguments:{command:'whoami'}}),
    error=>error.code==='MCP_TOOL_NOT_REGISTERED',
  );
  assert.equal(counter.calls,0);
});

test('duplicate tool registration is rejected',()=>{
  const counter={calls:0};
  assert.throws(()=>new GuardedMcpRegistry({entries:[
    {binding,providerCall:provider(counter),authorityScopes:['workspace.read'],policy},
    {binding,providerCall:provider(counter),authorityScopes:['workspace.read'],policy},
  ]}),error=>error.code==='MCP_TOOL_DUPLICATE');
});

test('registry does not return provider callbacks from public surfaces',()=>{
  const counter={calls:0};
  const registry=new GuardedMcpRegistry({entries:[{
    binding,providerCall:provider(counter),authorityScopes:['workspace.read'],policy,
  }]});
  const tool=registry.listTools()[0];
  const security=registry.securityDescriptor('workspace.read');
  assert.equal(typeof tool.providerCall,'undefined');
  assert.equal(typeof security.providerCall,'undefined');
  assert.equal(typeof security.gateway,'undefined');
});
