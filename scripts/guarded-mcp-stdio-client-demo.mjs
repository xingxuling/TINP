import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {rootHash} from '../src/identity.mjs';
import {makeExactActionChallenge} from '../src/exact-action-approval.mjs';
import {generateEd25519Keypair,signObject} from '../vendor/aaf/src/signatures.mjs';
import {sealApproval} from '../vendor/aaf/src/contracts.mjs';
import {AGENT_ACTION_APPROVAL_SCOPE,AGENT_ACTION_APPROVER_ROLE} from '../adapters/aaf-agent-action.mjs';

const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'taowind-guarded-mcp-'));
await fs.writeFile(path.join(workspace,'readme.md'),'TAOWIND official MCP client reached guarded provider.','utf8');

const approver=generateEd25519Keypair();
const signerId='demo:exact-action-approver';
const client=new Client({name:'taowind-guarded-verifier',version:'0.1.0'});
const transport=new StdioClientTransport({
  command:process.execPath,args:['scripts/guarded-mcp-stdio-server.mjs'],cwd:process.cwd(),
  env:{
    TAOWIND_AGENT_WORKSPACE_ROOT:workspace,
    TAOWIND_AGENT_APPROVER_ID:signerId,
    TAOWIND_AGENT_APPROVER_PUBLIC_KEY_B64:Buffer.from(approver.public_key_pem,'utf8').toString('base64'),
  },
  stderr:'pipe',
});

function approvalFor(tool,businessInput,requestId=randomUUID()){
  const meta=tool._meta;
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
    approval_id:`demo:${requestId}`,proposal_root:challenge.challengeRoot,
    approver_id:signerId,approver_roles:[AGENT_ACTION_APPROVER_ROLE],
    decision:'approved',scopes:[AGENT_ACTION_APPROVAL_SCOPE],conditions:[],
    issued_at:new Date(now-1000).toISOString(),expires_at:new Date(now+60000).toISOString(),
  }),approver.private_key_pem,signerId);
  return {...businessInput,_taowind:{requestId,approval}};
}

try{
  await client.connect(transport);
  const listed=await client.listTools();
  const readTool=listed.tools.find(item=>item.name==='workspace.read');
  const createTool=listed.tools.find(item=>item.name==='workspace.create');
  if(!readTool||!createTool)throw new Error('guarded workspace tools missing from official MCP tools/list');

  const safe=await client.callTool({
    name:'workspace.read',arguments:{path:'workspace/project/readme.md'},
  });

  const approved=approvalFor(createTool,{
    path:'workspace/project/generated.txt',content:'TAOWIND guarded MCP exact write is real.',
  });
  const created=await client.callTool({name:'workspace.create',arguments:approved});
  const replay=await client.callTool({name:'workspace.create',arguments:approved});
  const tampered=await client.callTool({
    name:'workspace.create',
    arguments:{...approved,content:'prompt injected replacement'},
  });
  const injectedRead=await client.callTool({
    name:'workspace.read',arguments:{path:'.ssh/id_rsa'},
  });

  console.log(JSON.stringify({
    format:'twni.official-mcp-exact-action-verification.v1',
    protocol:'MCP',
    tools:listed.tools.map(tool=>({
      name:tool.name,
      bindingRoot:tool._meta?.['taowind/bindingRoot']??null,
      exactApprovalRequired:tool._meta?.['taowind/exactApprovalRequired']??false,
      exactApprovalPolicyRoot:tool._meta?.['taowind/exactApprovalPolicyRoot']??null,
    })),
    safeRead:{isError:safe.isError??false,structuredContent:safe.structuredContent??null},
    exactCreate:{isError:created.isError??false,structuredContent:created.structuredContent??null},
    exactReplay:{isError:replay.isError??false,structuredContent:replay.structuredContent??null},
    contentTamper:{isError:tampered.isError??false,structuredContent:tampered.structuredContent??null},
    promptInjectedRead:{isError:injectedRead.isError??false,structuredContent:injectedRead.structuredContent??null},
  },null,2));
}finally{
  await client.close().catch(()=>{});
  await fs.rm(workspace,{recursive:true,force:true});
}
