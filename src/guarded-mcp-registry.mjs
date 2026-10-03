import {GuardedMcpToolGateway,GuardedToolGatewayError} from './guarded-tool-gateway.mjs';
import {verifyOppMcpActionBinding} from './mcp-action-binding.mjs';
import {makeAgentActionAdmissionFacts} from './agent-action-policy.mjs';

export class GuardedMcpRegistryError extends Error{
  constructor(code){super(code);this.code=code;}
}
function fail(ok,code){if(!ok)throw new GuardedMcpRegistryError(code);}

export class GuardedMcpRegistry{
  #entries=new Map();

  constructor({entries=[]}={}){
    fail(Array.isArray(entries),'MCP_REGISTRY_ENTRIES_ARRAY_REQUIRED');
    for(const entry of entries)this.register(entry);
  }

  register({binding,providerCall,authorityScopes=[],policy={},receiptSink=null,exactApproval=null}={}){
    const verified=verifyOppMcpActionBinding(binding);
    const name=verified.toolName;
    fail(!this.#entries.has(name),'MCP_TOOL_DUPLICATE');
    const facts=makeAgentActionAdmissionFacts({contract:verified.actionContract,authorityScopes,policy});
    fail(facts.contractVerified,'MCP_TOOL_POLICY_CONTRACT_INVALID');
    if(facts.approvalRequired){
      fail(exactApproval&&exactApproval.policy&&exactApproval.keyring,'MCP_EXACT_APPROVAL_CONFIG_REQUIRED');
      fail(exactApproval.policy.policyRoot===facts.approvalPolicyRoot,'MCP_EXACT_APPROVAL_POLICY_MISMATCH');
    }
    const gateway=new GuardedMcpToolGateway({providerCall,authorityScopes,policy,receiptSink,exactApproval});
    this.#entries.set(name,{
      tool:structuredClone(verified.mcpTool),binding:structuredClone(verified),gateway,
      security:{
        policyRoot:facts.policyRoot,
        exactApprovalRequired:facts.approvalRequired===true,
        exactApprovalPolicyRoot:facts.approvalPolicyRoot??null,
      },
    });
    return {toolName:name,bindingRoot:verified.bindingRoot};
  }

  listTools(){
    return [...this.#entries.values()].map(entry=>structuredClone(entry.tool)).sort((a,b)=>a.name.localeCompare(b.name));
  }

  securityDescriptor(name){
    const entry=this.#entries.get(name);
    fail(entry,'MCP_TOOL_NOT_REGISTERED');
    return {
      toolName:name,mcpToolRoot:entry.binding.mcpToolRoot,bindingRoot:entry.binding.bindingRoot,
      actionContractRoot:entry.binding.actionContractRoot,
      requiredAuthority:structuredClone(entry.binding.actionContract.requiredAuthority),
      declaredEffects:structuredClone(entry.binding.actionContract.declaredEffects),
      resources:structuredClone(entry.binding.actionContract.resources),
      reversibility:entry.binding.actionContract.reversibility,
      policyRoot:entry.security.policyRoot,
      exactApprovalRequired:entry.security.exactApprovalRequired,
      exactApprovalPolicyRoot:entry.security.exactApprovalPolicyRoot,
      authorityGranted:false,
    };
  }

  async callTool({name,arguments:args={}}={}){
    fail(typeof name==='string'&&name.length>0,'MCP_TOOL_NAME_REQUIRED');
    const entry=this.#entries.get(name);
    fail(entry,'MCP_TOOL_NOT_REGISTERED');
    return entry.gateway.call({binding:entry.binding,toolName:name,input:args});
  }
}

export {GuardedToolGatewayError};
