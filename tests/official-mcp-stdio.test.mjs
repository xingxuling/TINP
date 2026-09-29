import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {verifyLedger} from '../src/evidence.mjs';
import {rootHash} from '../src/identity.mjs';
import {verifyListedMcpToolAgainstBinding} from '../src/mcp-action-binding.mjs';
import {makeExactActionChallenge} from '../src/exact-action-approval.mjs';
import {generateEd25519Keypair,signObject} from '../vendor/aaf/src/signatures.mjs';
import {sealApproval} from '../vendor/aaf/src/contracts.mjs';
import {AGENT_ACTION_APPROVAL_SCOPE,AGENT_ACTION_APPROVER_ROLE} from '../adapters/aaf-agent-action.mjs';

const readBinding=JSON.parse(await fs.readFile(new URL('../registry/agent-actions/workspace-read.binding.json',import.meta.url),'utf8'));
const createBinding=JSON.parse(await fs.readFile(new URL('../registry/agent-actions/workspace-create.binding.json',import.meta.url),'utf8'));

async function connect(t,{enableCreate=true}={}){
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'tinp-official-mcp-'));
  await fs.writeFile(path.join(workspace,'readme.md'),'official MCP guarded read','utf8');
  const auditFile=path.join(workspace,'audit','guarded-mcp.jsonl');
  const approver=generateEd25519Keypair();
  const signerId='fixture:exact-action-approver';
  const env={
    TAOWIND_AGENT_WORKSPACE_ROOT:workspace,
    TAOWIND_AGENT_AUDIT_FILE:auditFile,
  };
  if(enableCreate){
    env.TAOWIND_AGENT_APPROVER_ID=signerId;
    env.TAOWIND_AGENT_APPROVER_PUBLIC_KEY_B64=Buffer.from(approver.public_key_pem,'utf8').toString('base64');
  }
  const client=new Client({name:'tinp-official-mcp-test',version:'0.1.0'});
  const transport=new StdioClientTransport({
    command:process.execPath,args:['scripts/guarded-mcp-stdio-server.mjs'],
    cwd:path.resolve('.'),env,stderr:'pipe',
  });
  await client.connect(transport);
  t.after(async()=>{
    await client.close().catch(()=>{});
    await fs.rm(workspace,{recursive:true,force:true});
  });
  return {client,transport,workspace,auditFile,approver,signerId};
}

async function approvedCreate(client,approver,signerId,businessInput,{requestId=randomUUID()}={}){
  const {tools}=await client.listTools();
  const tool=tools.find(item=>item.name==='workspace.create');
  assert.ok(tool,'workspace.create missing');
  const meta=tool._meta;
  assert.equal(meta['taowind/exactApprovalRequired'],true);
  const challenge=makeExactActionChallenge({
    requestId,toolName:tool.name,
    bindingRoot:meta['taowind/bindingRoot'],
    contractRoot:meta['taowind/actionContractRoot'],
    inputRoot:rootHash(businessInput),
    policyRoot:meta['taowind/policyRoot'],
    approvalPolicyRoot:meta['taowind/exactApprovalPolicyRoot'],
  });
  const now=Date.now();
  const approval=signObject(sealApproval({
    approval_id:`exact:${requestId}`,proposal_root:challenge.challengeRoot,
    approver_id:signerId,approver_roles:[AGENT_ACTION_APPROVER_ROLE],
    decision:'approved',scopes:[AGENT_ACTION_APPROVAL_SCOPE],conditions:[],
    issued_at:new Date(now-1000).toISOString(),expires_at:new Date(now+60000).toISOString(),
  }),approver.private_key_pem,signerId);
  return {...businessInput,_taowind:{requestId,approval}};
}

test('server without an external approver exposes read only',async t=>{
  const {client}=await connect(t,{enableCreate:false});
  const {tools}=await client.listTools();
  assert.deepEqual(tools.map(tool=>tool.name),['workspace.read']);
});

test('official MCP v2 tools/list roots both tools and advertises exact approval policy',async t=>{
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
  const create=tools.find(item=>item.name==='workspace.create');
  assert.equal(create._meta['taowind/exactApprovalRequired'],true);
  assert.match(create._meta['taowind/policyRoot'],/^[a-f0-9]{64}$/);
  assert.match(create._meta['taowind/exactApprovalPolicyRoot'],/^[a-f0-9]{64}$/);
});

test('official MCP client reaches the real read provider through TINP and RCL',async t=>{
  const {client}=await connect(t);
  const result=await client.callTool({name:'workspace.read',arguments:{path:'workspace/project/readme.md'}});
  assert.equal(result.isError??false,false);
  assert.equal(result.structuredContent.status,'VERIFIED');
  assert.equal(result.structuredContent.providerCalls,1);
});

test('exact signed approval authorizes one real filesystem create',async t=>{
  const {client,workspace,approver,signerId}=await connect(t);
  const args=await approvedCreate(client,approver,signerId,{
    path:'workspace/project/generated.txt',content:'guarded exact side effect',
  });
  const result=await client.callTool({name:'workspace.create',arguments:args});
  assert.equal(result.isError??false,false);
  assert.equal(result.structuredContent.status,'VERIFIED');
  assert.equal(result.structuredContent.providerCalls,1);
  assert.equal(await fs.readFile(path.join(workspace,'generated.txt'),'utf8'),'guarded exact side effect');
});

test('same path but changed content cannot reuse the approval',async t=>{
  const {client,workspace,approver,signerId}=await connect(t);
  const approved=await approvedCreate(client,approver,signerId,{
    path:'workspace/project/generated.txt',content:'approved content',
  });
  const tampered={...approved,content:'prompt injected replacement'};
  const result=await client.callTool({name:'workspace.create',arguments:tampered});
  assert.equal(result.isError,true);
  assert.equal(result.structuredContent.status,'DENIED_EXACT_APPROVAL');
  assert.equal(result.structuredContent.providerCalls,0);
  await assert.rejects(()=>fs.stat(path.join(workspace,'generated.txt')),error=>error.code==='ENOENT');
});

test('exact approval is one-shot and replay is denied before provider invocation',async t=>{
  const {client,workspace,approver,signerId}=await connect(t);
  const args=await approvedCreate(client,approver,signerId,{
    path:'workspace/project/generated.txt',content:'first and only',
  });
  const first=await client.callTool({name:'workspace.create',arguments:args});
  assert.equal(first.structuredContent.status,'VERIFIED');
  const second=await client.callTool({name:'workspace.create',arguments:args});
  assert.equal(second.isError,true);
  assert.equal(second.structuredContent.status,'DENIED_REPLAY');
  assert.equal(second.structuredContent.providerCalls,0);
  assert.equal(await fs.readFile(path.join(workspace,'generated.txt'),'utf8'),'first and only');
});

test('prompt-injected create path is denied by contract resource binding before write',async t=>{
  const {client,workspace}=await connect(t);
  const result=await client.callTool({
    name:'workspace.create',
    arguments:{path:'workspace/project/other.txt',content:'should not exist',_taowind:{requestId:'x',approval:{}}},
  });
  assert.equal(result.isError,true);
  assert.equal(result.structuredContent.status,'DENIED_INPUT_BINDING');
  assert.equal(result.structuredContent.providerCalls,0);
  await assert.rejects(()=>fs.stat(path.join(workspace,'other.txt')),error=>error.code==='ENOENT');
});

test('official MCP call with prompt-injected read path is denied before provider execution',async t=>{
  const {client}=await connect(t);
  const result=await client.callTool({name:'workspace.read',arguments:{path:'.ssh/id_rsa'}});
  assert.equal(result.isError,true);
  assert.equal(result.structuredContent.status,'DENIED_INPUT_BINDING');
  assert.equal(result.structuredContent.providerCalls,0);
});

test('official MCP SDK rejects schema-invalid arguments before provider handler',async t=>{
  const {client}=await connect(t);
  const result=await client.callTool({name:'workspace.read',arguments:{path:''}});
  assert.equal(result.isError,true);
  assert.match(result.content[0].text,/Invalid arguments|Too small|min/i);
});

test('official MCP execution persists a redacted hash-chained audit trail',async t=>{
  const {client,auditFile}=await connect(t);
  const safe=await client.callTool({name:'workspace.read',arguments:{path:'workspace/project/readme.md'}});
  const denied=await client.callTool({name:'workspace.read',arguments:{path:'.ssh/id_rsa'}});
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


test('exact-create audit persists roots but never approval signatures or raw content',async t=>{
  const {client,auditFile,approver,signerId}=await connect(t);
  const args=await approvedCreate(client,approver,signerId,{
    path:'workspace/project/generated.txt',content:'audit me by root only',
  });
  const result=await client.callTool({name:'workspace.create',arguments:args});
  assert.equal(result.structuredContent.status,'VERIFIED');
  const events=(await fs.readFile(auditFile,'utf8')).trimEnd().split('\n').map(JSON.parse);
  assert.equal(events.length,1);
  const detail=events[0].detail;
  assert.equal(detail.exactApprovalRequired,true);
  assert.equal(detail.exactApprovalStatus,'CONSUMED');
  assert.match(detail.exactApprovalPolicyRoot,/^[a-f0-9]{64}$/);
  assert.match(detail.exactChallengeRoot,/^[a-f0-9]{64}$/);
  assert.match(detail.exactApprovalRoot,/^[a-f0-9]{64}$/);
  assert.match(detail.exactApprovalVerificationRoot,/^[a-f0-9]{64}$/);
  assert.match(detail.exactApprovalConsumptionRoot,/^[a-f0-9]{64}$/);
  const serialized=JSON.stringify(detail);
  assert.equal(serialized.includes('"signature":'),false);
  assert.equal(serialized.includes('approval_id'),false);
  assert.equal(serialized.includes('-----BEGIN'),false);
  assert.equal(serialized.includes('audit me by root only'),false);
});
