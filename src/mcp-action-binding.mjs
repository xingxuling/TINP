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
  const resourceBindings=body.resourceBindings;
  const resourceKeys=['commands','filesystem','network','packages'];
  fail(resourceBindings&&typeof resourceBindings==='object'&&!Array.isArray(resourceBindings),'MCP_ACTION_RESOURCE_BINDINGS_REQUIRED');
  fail(Object.keys(resourceBindings).sort().join('|')===resourceKeys.sort().join('|'),'MCP_ACTION_RESOURCE_BINDINGS_SHAPE_INVALID');
  const inputProperties=body.capabilityDeclaration?.payload?.inputSchema?.properties;
  fail(inputProperties&&typeof inputProperties==='object'&&!Array.isArray(inputProperties),'MCP_ACTION_INPUT_PROPERTIES_REQUIRED');
  for(const key of resourceKeys){
    const fields=resourceBindings[key];
    fail(Array.isArray(fields)&&fields.every(field=>typeof field==='string'&&Object.hasOwn(inputProperties,field)),
      `MCP_ACTION_RESOURCE_BINDING_FIELD_INVALID:${key}`);
    if((body.actionContract.resources?.[key]??[]).length)
      fail(fields.length>0,`MCP_ACTION_RESOURCE_BINDING_REQUIRED:${key}`);
  }
  verifyOppActionContract(body.actionContract);
  fail(body.actionContract.capabilityId===body.toolName,'MCP_ACTION_BINDING_TOOL_CAPABILITY_MISMATCH');
  return structuredClone(binding);
}
