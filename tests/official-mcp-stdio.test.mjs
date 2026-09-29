import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {verifyLedger} from '../src/evidence.mjs';
import {verifyListedMcpToolAgainstBinding} from '../src/mcp-action-binding.mjs';

const readBinding=JSON.parse(await fs.readFile(new URL('../registry/agent-actions/workspace-read.binding.json',import.meta.url),'utf8'));
const createBinding=JSON.parse(await fs.readFile(new URL('../registry/agent-actions/workspace-create.binding.json',import.meta.url),'utf8'));

async function connect(t){
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'tinp-official-mcp-'));
  await fs.writeFile(path.join(workspace,'readme.md'),'official MCP guarded read','utf8');
  const auditFile=path.join(workspace,'audit','guarded-mcp.jsonl');
  const client=new Client({name:'tinp-official-mcp-test',version:'0.1.0'});
  const transport=new StdioClientTransport({
    command:process.execPath,
    args:['scripts/guarded-mcp-stdio-server.mjs'],
    cwd:path.resolve('.'),
    env:{
      TAOWIND_AGENT_WORKSPACE_ROOT:workspace,
      TAOWIND_AGENT_AUDIT_FILE:auditFile,
    },
    stderr:'pipe',
  });
  await client.connect(transport);
  t.after(async()=>{
    await client.close().catch(()=>{});
    await fs.rm(workspace,{recursive:true,force:true});
  });
  return {client,transport,workspace,auditFile};
}

test('official MCP v2 tools/list roots both tools to OPP action bindings',async t=>{
  const {client}=await connect(t);
  const {tools}=await client.listTools();
  assert.deepEqual(tools.map(tool=>tool.name).sort(),['workspace.create','workspace.read']);
  for(const [name,binding] of [['workspace.read',readBinding],['workspace.create',createBinding]]){
    const tool=tools.find(item=>item.name===name);
    const result=verifyListedMcpToolAgainstBinding(tool,binding);
    assert.equal(result.bindingRoot,binding.bindingRoot);
    assert.equal(result.normalizedToolRoot,binding.mcpToolRoot);
    assert.equal(tool._meta['taowind/authorityGranted'],false);
  }
});

test('official MCP client reaches the real read provider through TINP and RCL',async t=>{
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

test('official MCP client performs one guarded filesystem create side effect',async t=>{
  const {client,workspace}=await connect(t);
  const result=await client.callTool({
    name:'workspace.create',
    arguments:{path:'workspace/project/generated.txt',content:'guarded side effect'},
  });
  assert.equal(result.isError??false,false);
  assert.equal(result.structuredContent.status,'VERIFIED');
  assert.equal(result.structuredContent.providerCalls,1);
  assert.equal(result.structuredContent.executionMayHaveOccurred,true);
  assert.equal(await fs.readFile(path.join(workspace,'generated.txt'),'utf8'),'guarded side effect');
});

test('prompt-injected create path is denied before the write provider runs',async t=>{
  const {client,workspace}=await connect(t);
  const result=await client.callTool({
    name:'workspace.create',
    arguments:{path:'workspace/project/other.txt',content:'should not exist'},
  });
  assert.equal(result.isError,true);
  assert.equal(result.structuredContent.status,'DENIED_INPUT_BINDING');
  assert.equal(result.structuredContent.providerCalls,0);
  assert.equal(result.structuredContent.executionMayHaveOccurred,false);
  await assert.rejects(()=>fs.stat(path.join(workspace,'other.txt')),error=>error.code==='ENOENT');
});

test('repeated create is ambiguous-safe: one attempt, no overwrite, no retry',async t=>{
  const {client,workspace}=await connect(t);
  const first=await client.callTool({
    name:'workspace.create',
    arguments:{path:'workspace/project/generated.txt',content:'first'},
  });
  assert.equal(first.structuredContent.status,'VERIFIED');
  const second=await client.callTool({
    name:'workspace.create',
    arguments:{path:'workspace/project/generated.txt',content:'second'},
  });
  assert.equal(second.isError,true);
  assert.equal(second.structuredContent.status,'PROVIDER_ERROR');
  assert.equal(second.structuredContent.providerCalls,1);
  assert.equal(second.structuredContent.executionMayHaveOccurred,true);
  assert.equal(await fs.readFile(path.join(workspace,'generated.txt'),'utf8'),'first');
});

test('official MCP call with prompt-injected read path is denied before provider execution',async t=>{
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

test('official MCP execution persists a redacted hash-chained audit trail',async t=>{
  const {client,auditFile}=await connect(t);
  const safe=await client.callTool({
    name:'workspace.read',
    arguments:{path:'workspace/project/readme.md'},
  });
  const denied=await client.callTool({
    name:'workspace.read',
    arguments:{path:'.ssh/id_rsa'},
  });
  assert.equal(safe.structuredContent.status,'VERIFIED');
  assert.equal(denied.structuredContent.status,'DENIED_INPUT_BINDING');

  const lines=(await fs.readFile(auditFile,'utf8')).trimEnd().split('\n').map(JSON.parse);
  assert.equal(lines.length,2);
  assert.match(verifyLedger(lines),/^[a-f0-9]{64}$/);
  assert.deepEqual(lines.map(event=>event.detail.status),['VERIFIED','DENIED_INPUT_BINDING']);
  for(const event of lines){
    assert.equal(event.type,'guarded-mcp.receipt');
    assert.equal(Object.hasOwn(event.detail,'result'),false);
    assert.equal(Object.hasOwn(event.detail,'input'),false);
    assert.match(event.detail.inputRoot,/^[a-f0-9]{64}$/);
    assert.match(event.detail.receiptRoot,/^[a-f0-9]{64}$/);
  }
});
