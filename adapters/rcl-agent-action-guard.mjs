import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compileReality } from '../vendor/rcl/src/compiler.mjs';
import { runReality } from '../vendor/rcl/src/runtime.mjs';

const textFields=['subjectId','sessionSubjectId','leaseSubjectId','actionId','resourceId','contractRoot'];
const numberFields=['nowMs','notBeforeMs','expiresAtMs'];
const truthFields=['signatureVerified','sessionVerified','revoked','oppContractVerified','authorityScopeAllowed',
  'actionAllowed','resourceAllowed','sideEffectAllowed','reversibilityAllowed','credentialBoundaryMet',
  'networkBoundaryMet','processBoundaryMet','packageBoundaryMet','evidenceContinuous'];
export const RCL_AGENT_ACTION_FIELDS=Object.freeze([...textFields,...numberFields,...truthFields]);
let compiled,sourceSha256;

function snapshotFacts(input){
  if(!input || typeof input!=='object' || Array.isArray(input)) throw new TypeError('Input must be an object');
  const facts={};
  for(const field of RCL_AGENT_ACTION_FIELDS){
    const descriptor=Object.getOwnPropertyDescriptor(input,field);
    if(!descriptor || !Object.hasOwn(descriptor,'value')) throw new TypeError(`Missing data field: ${field}`);
    facts[field]=descriptor.value;
  }
  for(const field of textFields) if(typeof facts[field]!=='string' || !facts[field].trim() || facts[field].length>4096) throw new TypeError(`Invalid text: ${field}`);
  for(const field of numberFields) if(!Number.isSafeInteger(facts[field]) || facts[field]<0) throw new TypeError(`Invalid number: ${field}`);
  for(const field of truthFields) if(typeof facts[field]!=='boolean') throw new TypeError(`Invalid truth: ${field}`);
  return Object.freeze(facts);
}

/** Facts must come from authenticated server context, never raw prompt/model claims. */
export async function evaluateAgentActionGuard(input){
  let facts;
  try{facts=snapshotFacts(input);}catch(error){return {allowed:false,code:'RCL_AGENT_ACTION_INPUT_INVALID',reason:error.message,history:[]};}
  try{
    if(!compiled){
      const source=readFileSync(new URL('../rcl/agent-action.rcl',import.meta.url),'utf8');
      compiled=compileReality(source);
      sourceSha256=createHash('sha256').update(source).digest('hex');
    }
    const result=await runReality(compiled,{hostAdapters:{observation:{invoke(request){
      if(!Object.hasOwn(facts,request.capability) || request.args.length!==1 || request.args[0]!==request.capability) throw new Error('Unexpected observation');
      return facts[request.capability];
    }}}});
    const allowed=result.state['gate.allowed']===true;
    return {allowed,code:allowed?'RCL_AGENT_ACTION_ALLOWED':'RCL_AGENT_ACTION_DENIED',
      history:result.history,programRoot:result.programRoot,stateRoot:result.stateRoot,sourceSha256,
      factsRoot:createHash('sha256').update(JSON.stringify(facts)).digest('hex'),
      runtime:'RCL canonical compiler and JavaScript semantic runtime',coverage:'lowered-execution'};
  }catch(error){
    return {allowed:false,code:'RCL_AGENT_ACTION_EXECUTION_FAILED',reason:error.code??error.message,sourceSha256,history:[]};
  }
}
