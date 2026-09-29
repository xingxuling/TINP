import {rootHash} from './identity.mjs';
import {admitAgentAction} from './agent-action-admission.mjs';
import {verifyObservedAgentAction} from './agent-action-policy.mjs';
import {verifyOppMcpActionBinding} from './mcp-action-binding.mjs';

export class GuardedToolGatewayError extends Error{
  constructor(code,{receipt=null,cause=null}={}){
    super(code,{cause});
    this.code=code;
    this.receipt=receipt;
  }
}
function fail(ok,code){if(!ok)throw new GuardedToolGatewayError(code);}
function sealBody(body){return {...body,receiptRoot:rootHash(body)};}
function normalizeStrings(values){
  return [...new Set(values)].sort();
}
function verifyInputResources(binding,input){
  const projected={commands:[],filesystem:[],network:[],packages:[]};
  const violations=[];
  for(const key of Object.keys(projected)){
    const fields=binding.resourceBindings[key]??[];
    for(const field of fields){
      const value=input[field];
      if(typeof value==='string'&&value.length)projected[key].push(value);
      else if(Array.isArray(value)&&value.every(item=>typeof item==='string'&&item.length))
        projected[key].push(...value);
      else violations.push(`INPUT_RESOURCE_VALUE_INVALID:${key}:${field}`);
    }
    projected[key]=normalizeStrings(projected[key]);
    const expected=normalizeStrings(binding.actionContract.resources?.[key]??[]);
    if(JSON.stringify(projected[key])!==JSON.stringify(expected))
      violations.push(`INPUT_RESOURCE_MISMATCH:${key}`);
  }
  const body={
    format:'twni.mcp-input-resource-verification.v1',
    status:violations.length?'FAIL':'PASS',
    bindingRoot:binding.bindingRoot,
    inputRoot:rootHash(input),
    projectedResources:projected,
    expectedResources:structuredClone(binding.actionContract.resources),
    violations,
  };
  return {...body,verificationRoot:rootHash(body)};
}

export class GuardedMcpToolGateway{
  #providerCall;
  #authorityScopes;
  #policy;
  #receiptSink;

  constructor({providerCall,authorityScopes=[],policy={},receiptSink=null}={}){
    fail(typeof providerCall==='function','MCP_PROVIDER_CALL_REQUIRED');
    fail(receiptSink===null||typeof receiptSink==='function','MCP_RECEIPT_SINK_INVALID');
    this.#providerCall=providerCall;
    this.#authorityScopes=structuredClone(authorityScopes);
    this.#policy=structuredClone(policy);
    this.#receiptSink=receiptSink;
  }

  async #finish(body){
    const receipt=sealBody(body);
    if(this.#receiptSink){
      try{await this.#receiptSink(structuredClone(receipt));}
      catch(error){
        throw new GuardedToolGatewayError('MCP_AUDIT_SINK_FAILED',{receipt,cause:error});
      }
    }
    return receipt;
  }

  async call({binding,toolName,input={}}={}){
    const verifiedBinding=verifyOppMcpActionBinding(binding);
    fail(toolName===verifiedBinding.toolName,'MCP_TOOL_NAME_BINDING_MISMATCH');
    fail(input&&typeof input==='object'&&!Array.isArray(input),'MCP_TOOL_INPUT_OBJECT_REQUIRED');
    const inputRoot=rootHash(input);
    const inputResourceVerification=verifyInputResources(verifiedBinding,input);
    if(inputResourceVerification.status!=='PASS'){
      return this.#finish({
        format:'twni.guarded-mcp-tool-receipt.v1',
        status:'DENIED_INPUT_BINDING',
        toolName,inputRoot,bindingRoot:verifiedBinding.bindingRoot,
        contractRoot:verifiedBinding.actionContractRoot,
        admissionRoot:null,inputResourceVerification,
        providerCalls:0,implicitRetries:0,executionMayHaveOccurred:false,
        providerResultRoot:null,observationVerification:null,
        authorityGranted:false,
        boundary:'MCP call arguments did not match the resources root-bound into the OPP action contract; provider was not invoked.',
      });
    }
    const admission=await admitAgentAction({
      contract:verifiedBinding.actionContract,
      authorityScopes:this.#authorityScopes,
      policy:this.#policy,
    });

    if(!admission.allowed){
      return this.#finish({
        format:'twni.guarded-mcp-tool-receipt.v1',
        status:'DENIED',
        toolName,inputRoot,bindingRoot:verifiedBinding.bindingRoot,
        contractRoot:verifiedBinding.actionContractRoot,
        admissionRoot:admission.admissionRoot,inputResourceVerification,
        providerCalls:0,implicitRetries:0,executionMayHaveOccurred:false,
        providerResultRoot:null,observationVerification:null,
        authorityGranted:false,
        boundary:'TINP denied before the upstream MCP provider callback was invoked.',
      });
    }

    let providerResult;
    try{
      providerResult=await this.#providerCall({name:toolName,arguments:structuredClone(input)});
    }catch(error){
      return this.#finish({
        format:'twni.guarded-mcp-tool-receipt.v1',
        status:'PROVIDER_ERROR',
        toolName,inputRoot,bindingRoot:verifiedBinding.bindingRoot,
        contractRoot:verifiedBinding.actionContractRoot,
        admissionRoot:admission.admissionRoot,inputResourceVerification,
        providerCalls:1,implicitRetries:0,executionMayHaveOccurred:true,
        providerResultRoot:null,observationVerification:null,
        providerError:String(error?.code??error?.message??error),
        authorityGranted:false,
        boundary:'Provider invocation failed after admission. No automatic retry or rollback is claimed.',
      });
    }

    fail(providerResult&&typeof providerResult==='object'&&!Array.isArray(providerResult),'MCP_PROVIDER_RESULT_INVALID');
    const mcp=providerResult.mcp;
    const observation=providerResult.observation;
    fail(mcp&&typeof mcp==='object'&&!Array.isArray(mcp),'MCP_PROVIDER_PROTOCOL_RESULT_REQUIRED');

    let verification;
    if(!observation||typeof observation!=='object'||Array.isArray(observation)){
      verification={
        format:'twni.agent-action-observation-verification.v1',
        status:'FAIL',
        contractRoot:verifiedBinding.actionContractRoot,
        observedEffects:[],
        observedResources:{commands:[],filesystem:[],network:[],packages:[]},
        violations:['SECURITY_OBSERVATION_REQUIRED'],
        observationTrusted:false,
        boundary:'No provider security observation was supplied; execution cannot be accepted as verified.',
      };
      verification.verificationRoot=rootHash(verification);
    }else{
      verification=verifyObservedAgentAction({
        contract:verifiedBinding.actionContract,
        observedEffects:observation.effects??[],
        observedResources:observation.resources??{},
      });
    }

    const providerResultRoot=rootHash(mcp);
    const protocolFailed=mcp.isError===true;
    const observedFailed=verification.status!=='PASS';
    const status=protocolFailed?'PROVIDER_REPORTED_ERROR':(observedFailed?'QUARANTINED':'VERIFIED');
    return this.#finish({
      format:'twni.guarded-mcp-tool-receipt.v1',
      status,toolName,inputRoot,bindingRoot:verifiedBinding.bindingRoot,
      contractRoot:verifiedBinding.actionContractRoot,
      admissionRoot:admission.admissionRoot,inputResourceVerification,
      providerCalls:1,implicitRetries:0,executionMayHaveOccurred:true,
      providerResultRoot,observationVerification:verification,
      result:structuredClone(mcp),
      authorityGranted:false,
      boundary:'Gateway enforces pre-admission and checks provider-supplied observations. It is not OS/sandbox attestation and cannot detect side effects hidden from the observation adapter.',
    });
  }
}
