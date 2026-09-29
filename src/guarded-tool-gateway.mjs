import {rootHash} from './identity.mjs';
import {admitAgentAction} from './agent-action-admission.mjs';
import {makeAgentActionAdmissionFacts,verifyObservedAgentAction} from './agent-action-policy.mjs';
import {verifyOppMcpActionBinding} from './mcp-action-binding.mjs';
import {splitExactActionInput,verifyExactActionEnvelope,ExactActionReplayGuard} from './exact-action-approval.mjs';

export class GuardedToolGatewayError extends Error{
  constructor(code,{receipt=null,cause=null}={}){
    super(code,{cause});
    this.code=code;
    this.receipt=receipt;
  }
}
function fail(ok,code){if(!ok)throw new GuardedToolGatewayError(code);}
function sealBody(body){return {...body,receiptRoot:rootHash(body)};}
function normalizeStrings(values){return [...new Set(values)].sort();}
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
function exactSummary(required,verification=null,code=null,consumption=null,approvalPolicyRoot=null){
  return {
    required,
    status:required?(verification?(consumption?'CONSUMED':'VERIFIED'):'DENIED'):'NOT_REQUIRED',
    code,
    approvalPolicyRoot,
    challengeRoot:verification?.challengeRoot??null,
    approvalRoot:verification?.approvalRoot??null,
    verificationRoot:verification?.verificationRoot??null,
    consumed:consumption?.consumed===true,
    consumptionRoot:consumption?.keyRoot??null,
  };
}

export class GuardedMcpToolGateway{
  #providerCall;
  #authorityScopes;
  #policy;
  #receiptSink;
  #exactApproval;
  #replayGuard;

  constructor({providerCall,authorityScopes=[],policy={},receiptSink=null,exactApproval=null}={}){
    fail(typeof providerCall==='function','MCP_PROVIDER_CALL_REQUIRED');
    fail(receiptSink===null||typeof receiptSink==='function','MCP_RECEIPT_SINK_INVALID');
    fail(exactApproval===null||(exactApproval&&typeof exactApproval==='object'&&!Array.isArray(exactApproval)),
      'MCP_EXACT_APPROVAL_CONFIG_INVALID');
    this.#providerCall=providerCall;
    this.#authorityScopes=structuredClone(authorityScopes);
    this.#policy=structuredClone(policy);
    this.#receiptSink=receiptSink;
    this.#exactApproval=exactApproval?structuredClone(exactApproval):null;
    this.#replayGuard=new ExactActionReplayGuard();
  }

  async #finish(body){
    const receipt=sealBody(body);
    if(this.#receiptSink){
      try{await this.#receiptSink(structuredClone(receipt));}
      catch(error){throw new GuardedToolGatewayError('MCP_AUDIT_SINK_FAILED',{receipt,cause:error});}
    }
    return receipt;
  }

  async call({binding,toolName,input={}}={}){
    const verifiedBinding=verifyOppMcpActionBinding(binding);
    fail(toolName===verifiedBinding.toolName,'MCP_TOOL_NAME_BINDING_MISMATCH');
    fail(input&&typeof input==='object'&&!Array.isArray(input),'MCP_TOOL_INPUT_OBJECT_REQUIRED');

    const policyFacts=makeAgentActionAdmissionFacts({
      contract:verifiedBinding.actionContract,authorityScopes:this.#authorityScopes,policy:this.#policy,
    });
    const approvalRequired=policyFacts.approvalRequired===true;
    let businessInput,securityEnvelope;
    if(approvalRequired){
      ({businessInput,securityEnvelope}=splitExactActionInput(input));
    }else{
      businessInput=structuredClone(input);
      securityEnvelope=null;
    }

    const inputRoot=rootHash(businessInput);
    const inputResourceVerification=verifyInputResources(verifiedBinding,businessInput);
    if(inputResourceVerification.status!=='PASS'){
      return this.#finish({
        format:'twni.guarded-mcp-tool-receipt.v1',status:'DENIED_INPUT_BINDING',
        toolName,inputRoot,bindingRoot:verifiedBinding.bindingRoot,contractRoot:verifiedBinding.actionContractRoot,
        admissionRoot:null,inputResourceVerification,
        exactApproval:exactSummary(approvalRequired,null,'INPUT_RESOURCE_MISMATCH',null,policyFacts.approvalPolicyRoot),
        providerCalls:0,implicitRetries:0,executionMayHaveOccurred:false,
        providerResultRoot:null,observationVerification:null,authorityGranted:false,
        boundary:'MCP business arguments did not match resources root-bound into the OPP action contract; provider was not invoked.',
      });
    }

    let exactVerification=null;
    if(approvalRequired){
      if(!this.#exactApproval){
        return this.#finish({
          format:'twni.guarded-mcp-tool-receipt.v1',status:'DENIED_EXACT_APPROVAL',
          toolName,inputRoot,bindingRoot:verifiedBinding.bindingRoot,contractRoot:verifiedBinding.actionContractRoot,
          admissionRoot:null,inputResourceVerification,
          exactApproval:exactSummary(true,null,'EXACT_ACTION_APPROVAL_NOT_CONFIGURED',null,policyFacts.approvalPolicyRoot),
          providerCalls:0,implicitRetries:0,executionMayHaveOccurred:false,
          providerResultRoot:null,observationVerification:null,authorityGranted:false,
          boundary:'Exact action approval is required by policy but no verifier is configured; provider was not invoked.',
        });
      }
      try{
        exactVerification=verifyExactActionEnvelope({
          securityEnvelope,toolName,bindingRoot:verifiedBinding.bindingRoot,
          contractRoot:verifiedBinding.actionContractRoot,inputRoot,policyRoot:policyFacts.policyRoot,
          approvalPolicy:this.#exactApproval.policy,keyring:this.#exactApproval.keyring,
        });
      }catch(error){
        return this.#finish({
          format:'twni.guarded-mcp-tool-receipt.v1',status:'DENIED_EXACT_APPROVAL',
          toolName,inputRoot,bindingRoot:verifiedBinding.bindingRoot,contractRoot:verifiedBinding.actionContractRoot,
          admissionRoot:null,inputResourceVerification,
          exactApproval:exactSummary(true,null,error.code??error.message,null,policyFacts.approvalPolicyRoot),
          providerCalls:0,implicitRetries:0,executionMayHaveOccurred:false,
          providerResultRoot:null,observationVerification:null,authorityGranted:false,
          boundary:'Exact signed approval did not bind this tool, contract, policy, request id and business input root; provider was not invoked.',
        });
      }
    }

    const admission=await admitAgentAction({
      contract:verifiedBinding.actionContract,authorityScopes:this.#authorityScopes,policy:this.#policy,
      approvalVerified:Boolean(exactVerification),
    });
    if(!admission.allowed){
      return this.#finish({
        format:'twni.guarded-mcp-tool-receipt.v1',status:'DENIED',
        toolName,inputRoot,bindingRoot:verifiedBinding.bindingRoot,contractRoot:verifiedBinding.actionContractRoot,
        admissionRoot:admission.admissionRoot,inputResourceVerification,
        exactApproval:exactSummary(approvalRequired,exactVerification,null,null,policyFacts.approvalPolicyRoot),
        providerCalls:0,implicitRetries:0,executionMayHaveOccurred:false,
        providerResultRoot:null,observationVerification:null,authorityGranted:false,
        boundary:'TINP/RCL denied before the upstream MCP provider callback was invoked.',
      });
    }

    let consumption=null;
    if(approvalRequired){
      try{consumption=this.#replayGuard.consume(exactVerification);}
      catch(error){
        return this.#finish({
          format:'twni.guarded-mcp-tool-receipt.v1',status:'DENIED_REPLAY',
          toolName,inputRoot,bindingRoot:verifiedBinding.bindingRoot,contractRoot:verifiedBinding.actionContractRoot,
          admissionRoot:admission.admissionRoot,inputResourceVerification,
          exactApproval:exactSummary(true,exactVerification,error.code??error.message,null,policyFacts.approvalPolicyRoot),
          providerCalls:0,implicitRetries:0,executionMayHaveOccurred:false,
          providerResultRoot:null,observationVerification:null,authorityGranted:false,
          boundary:'A previously consumed exact approval cannot authorize another provider invocation.',
        });
      }
    }

    let providerResult;
    try{
      providerResult=await this.#providerCall({name:toolName,arguments:structuredClone(businessInput)});
    }catch(error){
      return this.#finish({
        format:'twni.guarded-mcp-tool-receipt.v1',status:'PROVIDER_ERROR',
        toolName,inputRoot,bindingRoot:verifiedBinding.bindingRoot,contractRoot:verifiedBinding.actionContractRoot,
        admissionRoot:admission.admissionRoot,inputResourceVerification,
        exactApproval:exactSummary(approvalRequired,exactVerification,null,consumption,policyFacts.approvalPolicyRoot),
        providerCalls:1,implicitRetries:0,executionMayHaveOccurred:true,
        providerResultRoot:null,observationVerification:null,
        providerError:String(error?.code??error?.message??error),authorityGranted:false,
        boundary:'Provider invocation failed after admission. Exact approvals are consumed before side effects; no automatic retry or rollback is claimed.',
      });
    }

    fail(providerResult&&typeof providerResult==='object'&&!Array.isArray(providerResult),'MCP_PROVIDER_RESULT_INVALID');
    const mcp=providerResult.mcp;
    const observation=providerResult.observation;
    fail(mcp&&typeof mcp==='object'&&!Array.isArray(mcp),'MCP_PROVIDER_PROTOCOL_RESULT_REQUIRED');

    let verification;
    if(!observation||typeof observation!=='object'||Array.isArray(observation)){
      verification={
        format:'twni.agent-action-observation-verification.v1',status:'FAIL',
        contractRoot:verifiedBinding.actionContractRoot,observedEffects:[],
        observedResources:{commands:[],filesystem:[],network:[],packages:[]},
        violations:['SECURITY_OBSERVATION_REQUIRED'],observationTrusted:false,
        boundary:'No provider security observation was supplied; execution cannot be accepted as verified.',
      };
      verification.verificationRoot=rootHash(verification);
    }else{
      verification=verifyObservedAgentAction({
        contract:verifiedBinding.actionContract,observedEffects:observation.effects??[],
        observedResources:observation.resources??{},
      });
    }

    const providerResultRoot=rootHash(mcp);
    const protocolFailed=mcp.isError===true;
    const observedFailed=verification.status!=='PASS';
    const status=protocolFailed?'PROVIDER_REPORTED_ERROR':(observedFailed?'QUARANTINED':'VERIFIED');
    return this.#finish({
      format:'twni.guarded-mcp-tool-receipt.v1',
      status,toolName,inputRoot,bindingRoot:verifiedBinding.bindingRoot,contractRoot:verifiedBinding.actionContractRoot,
      admissionRoot:admission.admissionRoot,inputResourceVerification,
      exactApproval:exactSummary(approvalRequired,exactVerification,null,consumption,policyFacts.approvalPolicyRoot),
      providerCalls:1,implicitRetries:0,executionMayHaveOccurred:true,
      providerResultRoot,observationVerification:verification,result:structuredClone(mcp),
      authorityGranted:false,
      boundary:'Gateway enforces pre-admission, optional exact signed approval, one-shot replay protection, and provider-supplied observation checks. It is not OS/sandbox attestation.',
    });
  }
}
