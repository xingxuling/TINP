import fs from 'node:fs';
import path from 'node:path';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {createDefaultGuardedOfficialMcpServer,defaultWorkspaceRoot} from '../src/official-mcp-server.mjs';

const workspaceRoot=defaultWorkspaceRoot();
const auditFile=process.env.TAOWIND_AGENT_AUDIT_FILE?path.resolve(process.env.TAOWIND_AGENT_AUDIT_FILE):null;
fs.mkdirSync(workspaceRoot,{recursive:true});
const defaultFile=path.join(workspaceRoot,'readme.md');
if(process.env.TAOWIND_AGENT_MCP_BOOTSTRAP_DEMO==='1'&&!fs.existsSync(defaultFile)){
  fs.writeFileSync(defaultFile,'TAOWIND guarded MCP stdio provider is real.','utf8');
}

void serveStdio(()=>createDefaultGuardedOfficialMcpServer({workspaceRoot,auditFile}).server);
console.error('[taowind] guarded MCP stdio server ready');
