import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {verifyListedMcpToolAgainstBinding} from '../src/mcp-action-binding.mjs';

const binding=JSON.parse(await fs.readFile(new URL('../registry/agent-actions/workspace-read.binding.json',import.meta.url),'utf8'));

async function connect(t){
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'tinp-official-mcp-'));
  await fs.writeFile(path.join(workspace,'readme.md'),'official MCP guarded read','utf8');
  const client=new Client({name:'tinp-official-mcp-test',version:'0.1.0'});
  const transport=new StdioClientTransport({
    command:process.execPath,
    args:['scripts/guarded-mcp-stdio-server.mjs'],
    cwd:path.resolve('.'),
    env:{TAOWIND_AGENT_WORKSPACE_ROOT:workspace},
    stderr:'pipe',
  });
  await client.connect(transport);
  t.after(async()=>{
    await client.close().catch(()=>{});
    await fs.rm(workspace,{recursive:true,force:true});
  });
  return {client,transport,workspace};
}

test('official MCP v2 tools/list is root-bound to the OPP action binding',async t=>{
  const {client}=await connect(t);
  const {tools}=await client.listTools();
  assert.equal(tools.length,1);
  assert.equal(tools[0].name,'workspace.read');
  const result=verifyListedMcpToolAgainstBinding(tools[0],binding);
  assert.equal(result.bindingRoot,binding.bindingRoot);
  assert.equal(result.normalizedToolRoot,binding.mcpToolRoot);
  assert.equal(tools[0]._meta['taowind/authorityGranted'],false);
});

test('official MCP client reaches the real provider through TINP and RCL',async t=>{
  const {client}=await connect(t);
  const result=await client.callTool({
    name:'workspace.read',
    arguments:{path:'workspace/project/readme.md'},
  });
  assert.equal(result.isError??false,false);
  assert.equal(result.structuredContent.status,'VERIFIED');
  assert.equal(result.structuredContent.providerCalls,1);
  assert.equal(result.structuredContent.executionMayHaveOccurred,true);
});

test('official MCP call with prompt-injected path is denied before provider execution',async t=>{
  const {client}=await connect(t);
  const result=await client.callTool({
    name:'workspace.read',
    arguments:{path:'.ssh/id_rsa'},
  });
  assert.equal(result.isError,true);
  assert.equal(result.structuredContent.status,'DENIED_INPUT_BINDING');
  assert.equal(result.structuredContent.providerCalls,0);
  assert.equal(result.structuredContent.executionMayHaveOccurred,false);
});

test('official MCP SDK rejects schema-invalid arguments before provider handler',async t=>{
  const {client}=await connect(t);
  const result=await client.callTool({
    name:'workspace.read',
    arguments:{path:''},
  });
  assert.equal(result.isError,true);
  assert.match(result.content[0].text,/Invalid arguments|Too small|min/i);
});
