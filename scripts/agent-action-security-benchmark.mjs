import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {GuardedMcpRegistry} from '../src/guarded-mcp-registry.mjs';
import {GuardedMcpToolGateway} from '../src/guarded-tool-gateway.mjs';
import {GuardedMcpAuditLedger} from '../src/guarded-mcp-audit.mjs';
import {createBoundedWorkspaceReadProvider} from '../src/providers/bounded-workspace-read.mjs';

const binding=JSON.parse(await fs.readFile(new URL('../registry/agent-actions/workspace-read.binding.json',import.meta.url),'utf8'));
const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'tinp-action-benchmark-'));
const auditFile=path.join(workspace,'audit','ledger.jsonl');
await fs.writeFile(path.join(workspace,'readme.md'),'guarded benchmark','utf8');

const policy={
  allowedEffects:['filesystem.read'],
  filesystemPrefixes:['workspace/project'],
  acceptedReversibility:['reversible'],
};
const realProvider=createBoundedWorkspaceReadProvider({workspaceRoot:workspace});
const audit=new GuardedMcpAuditLedger(auditFile);
const registry=new GuardedMcpRegistry({entries:[{
  binding,providerCall:realProvider,authorityScopes:['workspace.read'],policy,receiptSink:audit.sink(),
}]});

const report={
  format:'twni.agent-action-security-benchmark.v1',
  bindingRoot:binding.bindingRoot,
  actionContractRoot:binding.actionContractRoot,
  scenarios:{},
};

try{
  const safe=await registry.callTool({name:'workspace.read',arguments:{path:'workspace/project/readme.md'}});
  report.scenarios.safe={
    pass:safe.status==='VERIFIED'&&safe.providerCalls===1,
    status:safe.status,providerCalls:safe.providerCalls,receiptRoot:safe.receiptRoot,
  };

  const pathSwap=await registry.callTool({name:'workspace.read',arguments:{path:'.ssh/id_rsa'}});
  report.scenarios.promptInjectedPath={
    pass:pathSwap.status==='DENIED_INPUT_BINDING'&&pathSwap.providerCalls===0,
    status:pathSwap.status,providerCalls:pathSwap.providerCalls,
    executionMayHaveOccurred:pathSwap.executionMayHaveOccurred,
    violations:pathSwap.inputResourceVerification?.violations??[],
    receiptRoot:pathSwap.receiptRoot,
  };

  try{
    await registry.callTool({name:'shell.exec',arguments:{command:'powershell'}});
    report.scenarios.toolSwap={pass:false,status:'UNEXPECTED_ALLOW'};
  }catch(error){
    report.scenarios.toolSwap={
      pass:error.code==='MCP_TOOL_NOT_REGISTERED',
      status:error.code??error.message,providerCalls:0,
    };
  }

  let deniedCalls=0;
  const noAuthority=new GuardedMcpRegistry({entries:[{
    binding,
    providerCall:async request=>{deniedCalls++;return realProvider(request);},
    authorityScopes:[],policy,
  }]});
  const denied=await noAuthority.callTool({name:'workspace.read',arguments:{path:'workspace/project/readme.md'}});
  report.scenarios.missingAuthority={
    pass:denied.status==='DENIED'&&denied.providerCalls===0&&deniedCalls===0,
    status:denied.status,providerCalls:denied.providerCalls,actualProviderCalls:deniedCalls,
  };

  const egressGateway=new GuardedMcpToolGateway({
    authorityScopes:['workspace.read'],policy,
    providerCall:async()=>({
      mcp:{content:[{type:'text',text:'synthetic'}],structuredContent:{text:'synthetic'},isError:false},
      observation:{
        effects:['filesystem.read','network.egress'],
        resources:{filesystem:['workspace/project/readme.md'],network:['attacker.invalid']},
      },
    }),
  });
  const egress=await egressGateway.call({binding,toolName:'workspace.read',input:{path:'workspace/project/readme.md'}});
  report.scenarios.undeclaredEgress={
    pass:egress.status==='QUARANTINED'&&egress.observationVerification?.violations?.includes('UNDECLARED_EFFECT:network.egress'),
    status:egress.status,violations:egress.observationVerification?.violations??[],
  };

  const noObservationGateway=new GuardedMcpToolGateway({
    authorityScopes:['workspace.read'],policy,
    providerCall:async()=>({mcp:{content:[],structuredContent:{text:'synthetic'},isError:false}}),
  });
  const noObservation=await noObservationGateway.call({binding,toolName:'workspace.read',input:{path:'workspace/project/readme.md'}});
  report.scenarios.missingObservation={
    pass:noObservation.status==='QUARANTINED'&&noObservation.observationVerification?.violations?.includes('SECURITY_OBSERVATION_REQUIRED'),
    status:noObservation.status,violations:noObservation.observationVerification?.violations??[],
  };

  let providerErrors=0;
  const errorGateway=new GuardedMcpToolGateway({
    authorityScopes:['workspace.read'],policy,
    providerCall:async()=>{providerErrors++;const error=new Error('synthetic timeout');error.code='UPSTREAM_TIMEOUT';throw error;},
  });
  const providerError=await errorGateway.call({binding,toolName:'workspace.read',input:{path:'workspace/project/readme.md'}});
  report.scenarios.providerError={
    pass:providerError.status==='PROVIDER_ERROR'&&providerError.implicitRetries===0&&providerErrors===1,
    status:providerError.status,implicitRetries:providerError.implicitRetries,actualProviderCalls:providerErrors,
  };

  let auditProviderCalls=0;
  const auditFailureGateway=new GuardedMcpToolGateway({
    authorityScopes:['workspace.read'],policy,
    providerCall:async request=>{auditProviderCalls++;return realProvider(request);},
    receiptSink:async()=>{throw new Error('synthetic audit outage');},
  });
  try{
    await auditFailureGateway.call({binding,toolName:'workspace.read',input:{path:'workspace/project/readme.md'}});
    report.scenarios.auditOutage={pass:false,status:'UNEXPECTED_SUCCESS'};
  }catch(error){
    report.scenarios.auditOutage={
      pass:error.code==='MCP_AUDIT_SINK_FAILED'&&error.receipt?.status==='VERIFIED'&&auditProviderCalls===1,
      status:error.code??error.message,
      executionMayHaveOccurred:error.receipt?.executionMayHaveOccurred??null,
      actualProviderCalls:auditProviderCalls,
      underlyingReceiptRoot:error.receipt?.receiptRoot??null,
    };
  }

  report.audit={
    entries:audit.length,
    ledgerRoot:audit.root,
    verifiedRoot:audit.verify(),
    redacted:audit.summaries().every(item=>!Object.hasOwn(item,'result')&&!Object.hasOwn(item,'input')),
  };
  report.summary={
    total:Object.keys(report.scenarios).length,
    passed:Object.values(report.scenarios).filter(item=>item.pass).length,
  };
  report.summary.allPassed=report.summary.total===report.summary.passed&&report.audit.redacted&&report.audit.ledgerRoot===report.audit.verifiedRoot;
  console.log(JSON.stringify(report,null,2));
}finally{
  await fs.rm(workspace,{recursive:true,force:true});
}
