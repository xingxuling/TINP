import {rootHash} from './identity.mjs';
import {verifyOppActionContract} from './agent-action-policy.mjs';

export const OPP_MCP_ACTION_BINDING_FORMAT='taowind.opp.mcp-action-binding.v0.1';

export class McpActionBindingError extends Error{
  constructor(code){super(code);this.code=code;}
}
function fail(ok,code){if(!ok)throw new McpActionBindingError(code);}

export function verifyOppMcpActionBinding(binding){
  fail(binding&&typeof binding==='object'&&!Array.isArray(binding),'MCP_ACTION_BINDING_OBJECT_REQUIRED');
  const {bindingRoot,...body}=structuredClone(binding);
  fail(body.format===OPP_MCP_ACTION_BINDING_FORMAT,'MCP_ACTION_BINDING_FORMAT_INVALID');
  fail(typeof bindingRoot==='string'&&bindingRoot===rootHash(body),'MCP_ACTION_BINDING_ROOT_INVALID');
  fail(body.authorityGranted===false&&body.annotationsTrusted===false,'MCP_ACTION_BINDING_TRUST_BOUNDARY_INVALID');
  fail(typeof body.toolName==='string'&&body.toolName.length>0,'MCP_ACTION_BINDING_TOOL_INVALID');
  fail(typeof body.mcpToolRoot==='string'&&/^[a-f0-9]{64}$/.test(body.mcpToolRoot),'MCP_ACTION_BINDING_TOOL_ROOT_INVALID');
  fail(body.capabilityDeclaration&&typeof body.capabilityDeclaration==='object','MCP_ACTION_BINDING_CAPABILITY_REQUIRED');
  fail(rootHash(body.capabilityDeclaration)===body.capabilityRoot,'MCP_ACTION_BINDING_CAPABILITY_ROOT_MISMATCH');
  fail(body.actionContract&&typeof body.actionContract==='object','MCP_ACTION_BINDING_CONTRACT_REQUIRED');
  fail(body.actionContract.contractRoot===body.actionContractRoot,'MCP_ACTION_BINDING_CONTRACT_ROOT_MISMATCH');
  verifyOppActionContract(body.actionContract);
  fail(body.actionContract.capabilityId===body.toolName,'MCP_ACTION_BINDING_TOOL_CAPABILITY_MISMATCH');
  return structuredClone(binding);
}
