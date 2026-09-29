import fs from 'node:fs';
import path from 'node:path';
import * as z from 'zod/v4';
import {McpServer} from '@modelcontextprotocol/server';
import {GuardedMcpRegistry} from './guarded-mcp-registry.mjs';
import {createBoundedWorkspaceReadProvider} from './providers/bounded-workspace-read.mjs';
import {verifyOppMcpActionBinding} from './mcp-action-binding.mjs';
import {GuardedMcpAuditLedger} from './guarded-mcp-audit.mjs';

export class GuardedOfficialMcpServerError extends Error{
  constructor(code){super(code);this.code=code;}
}
function fail(ok,code){if(!ok)throw new GuardedOfficialMcpServerError(code);}

export function loadWorkspaceReadBinding(file=new URL('../registry/agent-actions/workspace-read.binding.json',import.meta.url)){
  const binding=JSON.parse(fs.readFileSync(file,'utf8'));
  verifyOppMcpActionBinding(binding);
  fail(binding.toolName==='workspace.read','MCP_WORKSPACE_BINDING_TOOL_INVALID');
  return binding;
}

function asZodSchema(schema,code){
  fail(schema&&typeof schema==='object'&&!Array.isArray(schema),code);
  try{return z.fromJSONSchema(schema);}
  catch{throw new GuardedOfficialMcpServerError(code);}
}

function toMcpResult(receipt){
  const summary={
    status:receipt.status,
    providerCalls:receipt.providerCalls,
    executionMayHaveOccurred:receipt.executionMayHaveOccurred,
    receiptRoot:receipt.receiptRoot,
  };
  return {
    content:[{type:'text',text:JSON.stringify(receipt)}],
    structuredContent:summary,
    isError:receipt.status!=='VERIFIED',
  };
}

/**
 * Build an official MCP v2 server from already-rooted OPP bindings.
 * Raw provider callbacks stay private inside GuardedMcpRegistry.
 */
export function createGuardedOfficialMcpServer({
  entries=[],
  name='taowind-guarded-agent-actions',
  version='0.1.0-candidate.1',
}={}){
  fail(Array.isArray(entries)&&entries.length>0,'MCP_GUARDED_ENTRIES_REQUIRED');
  const registry=new GuardedMcpRegistry({entries});
  const server=new McpServer({name,version});

  for(const tool of registry.listTools()){
    const security=registry.securityDescriptor(tool.name);
    const binding=entries.find(entry=>entry.binding.bindingRoot===security.bindingRoot)?.binding;
    fail(binding,'MCP_GUARDED_BINDING_NOT_FOUND');

    const inputSchema=asZodSchema(tool.inputSchema,'MCP_GUARDED_INPUT_SCHEMA_UNSUPPORTED');
    const outputSchema=asZodSchema(tool.outputSchema,'MCP_GUARDED_OUTPUT_SCHEMA_UNSUPPORTED');
    server.registerTool(
      tool.name,
      {
        ...(tool.title?{title:tool.title}:{}),
        ...(tool.description?{description:tool.description}:{}),
        inputSchema,
        outputSchema,
        ...(tool.annotations?{annotations:tool.annotations}:{}),
        _meta:{
          'taowind/bindingRoot':binding.bindingRoot,
          'taowind/actionContractRoot':binding.actionContractRoot,
          'taowind/authorityGranted':false,
        },
      },
      async args=>toMcpResult(await registry.callTool({name:tool.name,arguments:args})),
    );
  }
  return {server,registry};
}

export function createDefaultGuardedOfficialMcpServer({
  workspaceRoot,
  auditFile=null,
  binding=loadWorkspaceReadBinding(),
  name='taowind-guarded-agent-actions',
  version='0.1.0-candidate.1',
}={}){
  fail(typeof workspaceRoot==='string'&&workspaceRoot.length>0,'MCP_WORKSPACE_ROOT_REQUIRED');
  const provider=createBoundedWorkspaceReadProvider({workspaceRoot});
  const audit=auditFile?new GuardedMcpAuditLedger(auditFile):null;
  return {
    ...createGuardedOfficialMcpServer({
      name,version,
      entries:[{
        binding,
        providerCall:provider,
        receiptSink:audit?.sink()??null,
        authorityScopes:['workspace.read'],
        policy:{
          allowedEffects:['filesystem.read'],
          filesystemPrefixes:['workspace/project'],
          acceptedReversibility:['reversible'],
        },
      }],
    }),
    binding,
    audit,
  };
}

export function defaultWorkspaceRoot(){
  const configured=process.env.TAOWIND_AGENT_WORKSPACE_ROOT;
  return path.resolve(configured||'.runs/agent-action-mcp-workspace');
}
