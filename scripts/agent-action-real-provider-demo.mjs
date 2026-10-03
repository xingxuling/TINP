import fs from 'node:fs/promises';
import path from 'node:path';
import {GuardedMcpRegistry} from '../src/guarded-mcp-registry.mjs';
import {createBoundedWorkspaceReadProvider} from '../src/providers/bounded-workspace-read.mjs';

const binding=JSON.parse(await fs.readFile(new URL('../tests/fixtures/opp-mcp-workspace-read-binding.json',import.meta.url),'utf8'));
const root=path.resolve('.runs','agent-action-real-provider-demo');
await fs.rm(root,{recursive:true,force:true});
await fs.mkdir(root,{recursive:true});
await fs.writeFile(path.join(root,'readme.md'),'TAOWIND guarded provider is real.','utf8');

const provider=createBoundedWorkspaceReadProvider({workspaceRoot:root});
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

const safe=await registry.callTool({
  name:'workspace.read',
  arguments:{path:'workspace/project/readme.md'},
});
const injected=await registry.callTool({
  name:'workspace.read',
  arguments:{path:'.ssh/id_rsa'},
});

console.log(JSON.stringify({
  format:'twni.agent-action-real-provider-demo.v1',
  tools:registry.listTools().map(tool=>tool.name),
  safe:{status:safe.status,text:safe.result?.structuredContent?.text,providerCalls:safe.providerCalls,receiptRoot:safe.receiptRoot},
  promptInjectedPath:{status:injected.status,providerCalls:injected.providerCalls,violations:injected.inputResourceVerification?.violations,receiptRoot:injected.receiptRoot},
  boundary:'Real local filesystem provider behind GuardedMcpRegistry; still not OS-level sandbox attestation.',
},null,2));
