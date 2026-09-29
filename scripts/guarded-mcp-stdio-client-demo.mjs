import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'taowind-guarded-mcp-'));
await fs.writeFile(path.join(workspace,'readme.md'),'TAOWIND official MCP client reached guarded provider.','utf8');

const client=new Client({name:'taowind-guarded-verifier',version:'0.1.0'});
const transport=new StdioClientTransport({
  command:process.execPath,
  args:['scripts/guarded-mcp-stdio-server.mjs'],
  cwd:process.cwd(),
  env:{TAOWIND_AGENT_WORKSPACE_ROOT:workspace},
  stderr:'pipe',
});

try{
  await client.connect(transport);
  const listed=await client.listTools();
  const tool=listed.tools.find(item=>item.name==='workspace.read');
  if(!tool)throw new Error('workspace.read missing from official MCP tools/list');

  const safe=await client.callTool({
    name:'workspace.read',
    arguments:{path:'workspace/project/readme.md'},
  });
  const injected=await client.callTool({
    name:'workspace.read',
    arguments:{path:'.ssh/id_rsa'},
  });

  console.log(JSON.stringify({
    format:'twni.official-mcp-stdio-verification.v1',
    protocol:'MCP',
    tool:{
      name:tool.name,
      description:tool.description,
      inputSchema:tool.inputSchema,
      outputSchema:tool.outputSchema??null,
      annotations:tool.annotations??null,
      meta:tool._meta??null,
    },
    safe:{
      isError:safe.isError??false,
      structuredContent:safe.structuredContent??null,
    },
    promptInjectedPath:{
      isError:injected.isError??false,
      structuredContent:injected.structuredContent??null,
    },
  },null,2));
}finally{
  await client.close().catch(()=>{});
  await fs.rm(workspace,{recursive:true,force:true});
}
