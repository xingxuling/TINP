import {authentic,clone,id,ProtocolError,requireThat,rootHash,seal} from './identity.mjs';
import {evaluateAgentActionGuard} from '../adapters/rcl-agent-action-guard.mjs';

export const AGENT_ACTION_LEASE_FORMAT='twni.agent-action-lease.v1';
export const AGENT_ACTION_PLAN_FORMAT='twni.agent-action-plan.v1';
export const AGENT_ACTION_RECEIPT_FORMAT='twni.agent-action-receipt.v1';
export const OPP_ACTION_CONTRACT_FORMAT='taowind.opp.action-contract.v0.1';
export const SUPPORTED_EFFECTS=Object.freeze(['filesystem.write','network.egress','credential.read','process.spawn']);
const EFFECT_SET=new Set(SUPPORTED_EFFECTS);
const HIGH_RISK=new Set(['credential.read','process.spawn']);
const HASH=/^[a-f0-9]{64}$/;
const isPlain=x=>x&&typeof x==='object'&&!Array.isArray(x);
const sortedUnique=a=>[...new Set(a)].sort();
function ownValue(obj,key){const d=Object.getOwnPropertyDescriptor(obj,key);if(!d||!Object.hasOwn(d,'value'))throw new ProtocolError('AGENT_ACTION_ACCESSOR_OR_MISSING_FIELD',key);return d.value;}
function exact(obj,keys,code){requireThat(isPlain(obj),code);const own=Reflect.ownKeys(obj);requireThat(own.length===keys.length&&own.every(k=>typeof k==='string'&&keys.includes(k)),code);for(const k of keys)ownValue(obj,k);}
function cleanStrings(values,code){requireThat(Array.isArray(values),code);const out=[];for(const x of values){requireThat(typeof x==='string'&&x.trim()&&x.length<=4096,code);out.push(x);}requireThat(new Set(out).size===out.length,code);return [...out].sort();}
function cleanEffect(effect,code='AGENT_ACTION_EFFECT_INVALID'){exact(effect,['kind','resource'],code);const kind=ownValue(effect,'kind'),resource=ownValue(effect,'resource');requireThat(EFFECT_SET.has(kind),code);requireThat(typeof resource==='string'&&resource.trim()&&resource.length<=4096,code);return {kind,resource};}
function cleanGrant(grant){exact(grant,['kind','resourcePrefix'],'AGENT_ACTION_GRANT_INVALID');const kind=ownValue(grant,'kind'),resourcePrefix=ownValue(grant,'resourcePrefix');requireThat(EFFECT_SET.has(kind),'AGENT_ACTION_GRANT_INVALID');requireThat(typeof resourcePrefix==='string'&&resourcePrefix.trim()&&resourcePrefix.length<=4096,'AGENT_ACTION_GRANT_INVALID');return {kind,resourcePrefix};}
const effectKey=e=>`${e.kind}\u0000${e.resource}`;
const grantKey=g=>`${g.kind}\u0000${g.resourcePrefix}`;
const sortEffects=a=>[...a].sort((x,y)=>x.kind.localeCompare(y.kind)||x.resource.localeCompare(y.resource));
const sortGrants=a=>[...a].sort((x,y)=>x.kind.localeCompare(y.kind)||x.resourcePrefix.localeCompare(y.resourcePrefix));
function riskClass(payload,effects){const kinds=new Set(effects.map(x=>x.kind));return [...kinds].some(x=>HIGH_RISK.has(x))||payload.reversibility==='irreversible'?'high':(effects.length?'medium':'low');}

export function validateOppActionContract(contract){
  const keys=['format','version','subjectId','capability','capabilityRoot','capabilityId','operation','authorityRequired','requestedEffects','reversibility','riskClass','actionInputRoot','authorityGranted','boundary','contractRoot'];
  exact(contract,keys,'OPP_ACTION_CONTRACT_INVALID');
  requireThat(contract.format===OPP_ACTION_CONTRACT_FORMAT&&typeof contract.version==='string'&&contract.version.length>0,'OPP_ACTION_CONTRACT_INVALID');
  requireThat(typeof contract.subjectId==='string'&&contract.subjectId.trim()&&contract.subjectId.length<=1024,'OPP_ACTION_CONTRACT_INVALID');
  const {contractRoot,...body}=contract;
  requireThat(HASH.test(contractRoot)&&rootHash(body)===contractRoot,'OPP_ACTION_CONTRACT_ROOT_INVALID');
  requireThat(isPlain(contract.capability)&&rootHash(contract.capability)===contract.capabilityRoot,'OPP_ACTION_CAPABILITY_ROOT_INVALID');
  const payload=contract.capability.payload;
  requireThat(isPlain(payload)&&payload.capabilityId===contract.capabilityId&&payload.operation===contract.operation,'OPP_ACTION_CAPABILITY_BINDING_INVALID');
  const authorities=cleanStrings(contract.authorityRequired,'OPP_ACTION_AUTHORITY_INVALID');
  requireThat(JSON.stringify(contract.authorityRequired)===JSON.stringify(authorities),'OPP_ACTION_AUTHORITY_ORDER_INVALID');
  requireThat(JSON.stringify(authorities)===JSON.stringify(sortedUnique(payload.authorityRequired??[])),'OPP_ACTION_AUTHORITY_BINDING_INVALID');
  requireThat(Array.isArray(contract.requestedEffects)&&contract.authorityGranted===false&&HASH.test(contract.actionInputRoot),'OPP_ACTION_CONTRACT_INVALID');
  const effects=contract.requestedEffects.map(x=>cleanEffect(x,'OPP_ACTION_EFFECT_INVALID'));
  requireThat(new Set(effects.map(effectKey)).size===effects.length,'OPP_ACTION_EFFECT_DUPLICATE');
  requireThat(JSON.stringify(contract.requestedEffects)===JSON.stringify(sortEffects(effects)),'OPP_ACTION_EFFECT_ORDER_INVALID');
  const declared=new Set(payload.sideEffects??[]);
  requireThat(effects.every(x=>declared.has(x.kind)),'OPP_ACTION_UNDECLARED_SIDE_EFFECT');
  requireThat(contract.reversibility===payload.reversibility,'OPP_ACTION_REVERSIBILITY_BINDING_INVALID');
  requireThat(contract.riskClass===riskClass(payload,effects),'OPP_ACTION_RISK_BINDING_INVALID');
  return true;
}

export function makeAgentActionLease({subjectId,authorities=[],grants=[],providerIds=[],notBeforeMs,expiresAtMs,requireOperatorApprovalFor=[]}={},issuerIdentity){
  requireThat(issuerIdentity?.privateKey,'AGENT_ACTION_LEASE_ISSUER_REQUIRED');
  requireThat(typeof subjectId==='string'&&subjectId.trim()&&subjectId.length<=1024,'AGENT_ACTION_LEASE_SUBJECT_INVALID');
  requireThat(Number.isSafeInteger(notBeforeMs)&&Number.isSafeInteger(expiresAtMs)&&0<=notBeforeMs&&notBeforeMs<expiresAtMs,'AGENT_ACTION_LEASE_TIME_INVALID');
  const cleanGrants=sortGrants(grants.map(cleanGrant));
  requireThat(new Set(cleanGrants.map(grantKey)).size===cleanGrants.length,'AGENT_ACTION_GRANT_DUPLICATE');
  const approval=cleanStrings(requireOperatorApprovalFor,'AGENT_ACTION_APPROVAL_POLICY_INVALID');
  requireThat(approval.every(x=>EFFECT_SET.has(x)),'AGENT_ACTION_APPROVAL_POLICY_INVALID');
  const body={
    format:AGENT_ACTION_LEASE_FORMAT,
    leaseId:id('action-lease'),
    subjectId,
    authorities:cleanStrings(authorities,'AGENT_ACTION_AUTHORITY_INVALID'),
    grants:cleanGrants,
    providerIds:cleanStrings(providerIds,'AGENT_ACTION_PROVIDER_INVALID'),
    notBeforeMs,
    expiresAtMs,
    requireOperatorApprovalFor:approval,
    boundary:'Issuer grants only the bounded authorities/effects/resources/providers in this signed lease; no ambient OS, network or credential authority is inherited.'
  };
  return seal(body,issuerIdentity.privateKey);
}

export function validateAgentActionLease(envelope,{issuerPublicKey,nowMs}={}){
  requireThat(issuerPublicKey,'AGENT_ACTION_LEASE_ISSUER_KEY_REQUIRED');
  requireThat(isPlain(envelope)&&isPlain(envelope.body)&&HASH.test(envelope.root)&&typeof envelope.signature==='string','AGENT_ACTION_LEASE_INVALID');
  requireThat(authentic(envelope,issuerPublicKey),'AGENT_ACTION_LEASE_SIGNATURE_INVALID');
  const b=envelope.body;
  exact(b,['format','leaseId','subjectId','authorities','grants','providerIds','notBeforeMs','expiresAtMs','requireOperatorApprovalFor','boundary'],'AGENT_ACTION_LEASE_INVALID');
  requireThat(b.format===AGENT_ACTION_LEASE_FORMAT&&typeof b.leaseId==='string'&&b.leaseId&&typeof b.subjectId==='string'&&b.subjectId.trim(),'AGENT_ACTION_LEASE_INVALID');
  const authorities=cleanStrings(b.authorities,'AGENT_ACTION_AUTHORITY_INVALID');
  const providers=cleanStrings(b.providerIds,'AGENT_ACTION_PROVIDER_INVALID');
  const grants=b.grants.map(cleanGrant);
  const approval=cleanStrings(b.requireOperatorApprovalFor,'AGENT_ACTION_APPROVAL_POLICY_INVALID');
  requireThat(JSON.stringify(b.authorities)===JSON.stringify(authorities)&&JSON.stringify(b.providerIds)===JSON.stringify(providers),'AGENT_ACTION_LEASE_ORDER_INVALID');
  requireThat(JSON.stringify(b.grants)===JSON.stringify(sortGrants(grants))&&new Set(grants.map(grantKey)).size===grants.length,'AGENT_ACTION_GRANT_INVALID');
  requireThat(JSON.stringify(b.requireOperatorApprovalFor)===JSON.stringify(approval)&&approval.every(x=>EFFECT_SET.has(x)),'AGENT_ACTION_APPROVAL_POLICY_INVALID');
  requireThat(Number.isSafeInteger(b.notBeforeMs)&&Number.isSafeInteger(b.expiresAtMs)&&b.notBeforeMs<b.expiresAtMs,'AGENT_ACTION_LEASE_TIME_INVALID');
  requireThat(Number.isSafeInteger(nowMs)&&b.notBeforeMs<=nowMs&&nowMs<b.expiresAtMs,'AGENT_ACTION_LEASE_NOT_ACTIVE');
  return true;
}

function resourceAllowed(effect,grants){
  return grants.some(g=>g.kind===effect.kind&&(g.resourcePrefix.endsWith('/')?effect.resource.startsWith(g.resourcePrefix):effect.resource===g.resourcePrefix));
}
function effectDeclaredInGrant(kind,grants){return grants.some(g=>g.kind===kind);}

export async function planAgentAction({contract,actionInput,leaseEnvelope,issuerPublicKey,providerId,nowMs,revoked=false,operatorApprovalVerified=false,evidenceContinuous=true}={}){
  let contractVerified=false,leaseVerified=false,contractError=null,leaseError=null;
  try{validateOppActionContract(contract);contractVerified=true;}catch(error){contractError=error.code??error.message;}
  try{validateAgentActionLease(leaseEnvelope,{issuerPublicKey,nowMs});leaseVerified=true;}catch(error){leaseError=error.code??error.message;}
  const lease=leaseVerified?leaseEnvelope.body:{subjectId:'',authorities:[],grants:[],providerIds:[],requireOperatorApprovalFor:[]};
  const effects=contractVerified?contract.requestedEffects:[];
  const kinds=effects.map(x=>x.kind);
  const approvalRequired=kinds.some(k=>lease.requireOperatorApprovalFor.includes(k));
  const facts={
    contractVerified,
    leaseVerified,
    subjectBound:contractVerified&&leaseVerified&&contract.subjectId===lease.subjectId,
    inputBound:contractVerified&&rootHash(actionInput)===contract.actionInputRoot,
    authorityWithinLease:contractVerified&&leaseVerified&&contract.authorityRequired.every(x=>lease.authorities.includes(x)),
    effectsWithinLease:contractVerified&&leaseVerified&&kinds.every(k=>effectDeclaredInGrant(k,lease.grants)),
    resourcesWithinLease:contractVerified&&leaseVerified&&effects.every(e=>resourceAllowed(e,lease.grants)),
    providerBound:leaseVerified&&typeof providerId==='string'&&lease.providerIds.includes(providerId),
    knownEffectsOnly:contractVerified&&effects.every(e=>EFFECT_SET.has(e.kind)),
    approvalRequired,
    operatorApprovalVerified:operatorApprovalVerified===true,
    evidenceContinuous:evidenceContinuous===true,
    revoked:revoked===true
  };
  const guard=await evaluateAgentActionGuard(facts);
  const planBody={
    format:AGENT_ACTION_PLAN_FORMAT,
    status:guard.allowed?'ALLOW':'DENY',
    code:guard.code,
    contractRoot:contractVerified?contract.contractRoot:null,
    leaseRoot:leaseVerified?leaseEnvelope.root:null,
    subjectId:contractVerified?contract.subjectId:null,
    providerId:typeof providerId==='string'?providerId:null,
    requestedEffects:clone(effects),
    facts,
    guard:{programRoot:guard.programRoot??null,stateRoot:guard.stateRoot??null,sourceSha256:guard.sourceSha256??null,factsRoot:guard.factsRoot??null},
    diagnostic:{contractError,leaseError},
    authorityGranted:false,
    boundary:'TINP accepts or denies a previously issued lease at an RCL gate; it does not create authority. Untrusted prompt text is data, never an authority source.'
  };
  return {...planBody,planRoot:rootHash(planBody)};
}

function observedWithinContract(observed,contract){const wanted=new Set(contract.requestedEffects.map(effectKey));return observed.every(e=>wanted.has(effectKey(e)));}
function observedWithinLease(observed,lease){return observed.every(e=>resourceAllowed(e,lease.grants));}
function receipt(body,ledger){const value={...body,receiptRoot:rootHash(body)};ledger?.append?.('agent-action.receipt',value);return value;}

export async function runAgentAction(options,{executor,ledger}={}){
  requireThat(typeof executor==='function','AGENT_ACTION_EXECUTOR_REQUIRED');
  const plan=await planAgentAction(options);
  ledger?.append?.('agent-action.plan',plan);
  if(plan.status!=='ALLOW'){
    return receipt({
      format:AGENT_ACTION_RECEIPT_FORMAT,status:'DENIED',diagnosticCode:plan.code,planRoot:plan.planRoot,
      executorCalled:false,resultAccepted:false,result:null,resultRoot:rootHash(null),observedEffects:[],
      implicitRetries:0,authorityGranted:false,boundary:'Denied before executor invocation by the RCL-backed action gate.'
    },ledger);
  }

  let raw;
  try{
    raw=await executor(clone(options.actionInput),{contract:clone(options.contract),plan:clone(plan)});
  }catch(error){
    return receipt({
      format:AGENT_ACTION_RECEIPT_FORMAT,status:'PENDING',diagnosticCode:error.code??error.name??'EXECUTOR_ERROR',planRoot:plan.planRoot,
      executorCalled:true,resultAccepted:false,result:null,resultRoot:rootHash(null),observedEffects:[],
      implicitRetries:0,authorityGranted:false,boundary:'Executor outcome is uncertain; no automatic retry or rollback is claimed.'
    },ledger);
  }

  let observed=[];
  try{
    requireThat(isPlain(raw)&&Array.isArray(raw.observedEffects)&&Object.hasOwn(raw,'result'),'AGENT_ACTION_EXECUTOR_RESULT_INVALID');
    observed=raw.observedEffects.map(e=>cleanEffect(e,'AGENT_ACTION_OBSERVED_EFFECT_INVALID'));
    requireThat(new Set(observed.map(effectKey)).size===observed.length,'AGENT_ACTION_OBSERVED_EFFECT_DUPLICATE');
  }catch(error){
    return receipt({
      format:AGENT_ACTION_RECEIPT_FORMAT,status:'QUARANTINED',diagnosticCode:error.code??error.message,planRoot:plan.planRoot,
      executorCalled:true,resultAccepted:false,result:null,resultRoot:rootHash(raw?.result??null),observedEffects:[],
      implicitRetries:0,authorityGranted:false,boundary:'Execution returned invalid or unbounded effect evidence. Result is quarantined; no automatic rollback is claimed.'
    },ledger);
  }

  const accepted=observedWithinContract(observed,options.contract)&&observedWithinLease(observed,options.leaseEnvelope.body);
  return receipt({
    format:AGENT_ACTION_RECEIPT_FORMAT,status:accepted?'PASS':'QUARANTINED',diagnosticCode:accepted?null:'OBSERVED_EFFECT_OUTSIDE_CONTRACT_OR_LEASE',planRoot:plan.planRoot,
    executorCalled:true,resultAccepted:accepted,result:accepted?clone(raw.result):null,resultRoot:rootHash(raw.result),observedEffects:observed,
    implicitRetries:0,authorityGranted:false,boundary:accepted
      ?'Observed effects stayed within the declared OPP contract and signed lease.'
      :'Observed effects exceeded the declared contract or signed lease. Result is not accepted; this receipt does not claim automatic rollback of already occurred effects.'
  },ledger);
}
