import fs from 'node:fs';
import path from 'node:path';
import * as z from 'zod/v4';
import {McpServer} from '@modelcontextprotocol/server';
import {GuardedMcpRegistry} from './guarded-mcp-registry.mjs';
import {createBoundedWorkspaceReadProvider} from './providers/bounded-workspace-read.mjs';
import {verifyOppMcpActionBinding} from './mcp-action-binding.mjs';

export class GuardedOfficialMcpServerError extends Error{
  constructor(code){super(code);this.code=code;}
}
function fail(ok,code){if(!ok)throw new GuardedOfficialMcpServerError(code);}

export function loadWorkspaceReadBinding(file=new URL('../registry/agent-actions/workspace-read.binding.json',import.meta.url)){
  const binding=JSON.parse(fs.readFileSync(file,'utf8'));
  verifyOppMcpActionBinding(binding);
  fail(binding.toolName==='workspace.read','MCP_WORKSPACE_BINDING_TOOL_INVALID');
  const schema=binding.mcpTool?.inputSchema;
  fail(schema?.type==='object'&&schema.additionalProperties===false,'MCP_WORKSPACE_SCHEMA_INVALID');
  fail(schema?.properties?.path?.type==='string','MCP_WORKSPACE_PATH_SCHEMA_INVALID');
  fail(Array.isArray(schema.required)&&schema.required.includes('path'),'MCP_WORKSPACE_PATH_REQUIRED');
  return binding;
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

export function createGuardedOfficialMcpServer({
  workspaceRoot,
  binding=loadWorkspaceReadBinding(),
  name='taowind-guarded-agent-actions',
  version='0.1.0-candidate.1',
}={}){
  fail(typeof workspaceRoot==='string'&&workspaceRoot.length>0,'MCP_WORKSPACE_ROOT_REQUIRED');
  const provider=createBoundedWorkspaceReadProvider({workspaceRoot});
  const registry=new GuardedMcpRegistry({entries:[{
    binding,
    providerCall:provider,
    authorityScopes:['workspace.read'],
    policy:{
      allowedEffects:['filesystem.read'],
      filesystemPrefixes:['workspace/project'],
      acceptedReversibility:['reversible'],
    },
  }]});

  const server=new McpServer({name,version});
  server.registerTool(
    'workspace.read',
    {
      title:'Guarded workspace read',
      description:binding.mcpTool.description,
      inputSchema:z.object({path:z.string().min(1)}).strict(),
      outputSchema:z.object({
        status:z.string(),
        providerCalls:z.number().int().nonnegative(),
        executionMayHaveOccurred:z.boolean(),
        receiptRoot:z.string().regex(/^[a-f0-9]{64}$/),
      }).strict(),
      annotations:{
        readOnlyHint:true,
        destructiveHint:false,
        idempotentHint:true,
        openWorldHint:false,
      },
      _meta:{
        'taowind/bindingRoot':binding.bindingRoot,
        'taowind/actionContractRoot':binding.actionContractRoot,
        'taowind/authorityGranted':false,
      },
    },
    async ({path:resource})=>toMcpResult(await registry.callTool({
      name:'workspace.read',
      arguments:{path:resource},
    })),
  );

  return {server,registry,binding};
}

export function defaultWorkspaceRoot(){
  const configured=process.env.TAOWIND_AGENT_WORKSPACE_ROOT;
  return path.resolve(configured||'.runs/agent-action-mcp-workspace');
}
