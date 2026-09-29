import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compileReality } from '../vendor/rcl/src/compiler.mjs';
import { runReality } from '../vendor/rcl/src/runtime.mjs';

export const RCL_AGENT_ACTION_FIELDS=Object.freeze([
  'contractVerified','authorityBound','effectsAuthorized','resourcesBounded',
  'reversibilityAccepted','effectSetComplete','approvalRequired','approvalVerified',
]);
let compiled;
let sourceSha256;

function snapshotFacts(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Input must be an object');
  const facts={};
  for(const field of RCL_AGENT_ACTION_FIELDS){
    const descriptor=Object.getOwnPropertyDescriptor(input,field);
    if(!descriptor||!Object.hasOwn(descriptor,'value'))throw new TypeError(`Missing data field: ${field}`);
    facts[field]=descriptor.value;
  }
  for(const field of RCL_AGENT_ACTION_FIELDS)
    if(typeof facts[field]!=='boolean')throw new TypeError(`Invalid truth: ${field}`);
  return Object.freeze(facts);
}

/** Facts must originate from verified OPP contract + authenticated TINP policy context. */
export async function evaluateAgentActionGuard(input){
  let facts;
  try{facts=snapshotFacts(input);}
  catch(error){
    return {allowed:false,code:'RCL_AGENT_ACTION_INPUT_INVALID',reason:error.message,history:[]};
  }
  try{
    if(!compiled){
      const source=readFileSync(new URL('../rcl/agent-action.rcl',import.meta.url),'utf8');
      compiled=compileReality(source);
      sourceSha256=createHash('sha256').update(source).digest('hex');
    }
    const result=await runReality(compiled,{
      hostAdapters:{observation:{invoke(request){
        if(!Object.hasOwn(facts,request.capability)||request.args.length!==0)
          throw new Error('Unexpected observation');
        return facts[request.capability];
      }}},
    });
    const allowed=result.state['gate.allowed']===true;
    return {
      allowed,code:allowed?'RCL_AGENT_ACTION_ALLOWED':'RCL_AGENT_ACTION_DENIED',
      history:result.history,programRoot:result.programRoot,stateRoot:result.stateRoot,sourceSha256,
      factsRoot:createHash('sha256').update(JSON.stringify(facts)).digest('hex'),
      runtime:'RCL canonical compiler and JavaScript semantic runtime',
      coverage:'lowered-execution',
    };
  }catch(error){
    return {
      allowed:false,code:'RCL_AGENT_ACTION_EXECUTION_FAILED',
      reason:error.code??error.message,sourceSha256,history:[],
    };
  }
}
