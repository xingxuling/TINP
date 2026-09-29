import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileReality} from '../vendor/rcl/src/compiler.mjs';
import {runReality} from '../vendor/rcl/src/runtime.mjs';

const fields=[
  'contractVerified','leaseVerified','subjectBound','inputBound',
  'authorityWithinLease','effectsWithinLease','resourcesWithinLease',
  'providerBound','knownEffectsOnly','approvalRequired','operatorApprovalVerified',
  'evidenceContinuous','revoked'
];
export const RCL_AGENT_ACTION_FIELDS=Object.freeze([...fields]);
let compiled,sourceSha256;
const hash=value=>createHash('sha256').update(value).digest('hex');
function snapshot(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Input must be an object');
  const facts={};
  for(const field of fields){
    const d=Object.getOwnPropertyDescriptor(input,field);
    if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='boolean')throw new TypeError(`Invalid truth: ${field}`);
    facts[field]=d.value;
  }
  return Object.freeze(facts);
}
/** Facts must come from the trusted gateway adapter, never raw Agent/prompt claims. */
export async function evaluateAgentActionGuard(input){
  let facts;
  try{facts=snapshot(input);}catch(error){return {allowed:false,code:'RCL_AGENT_ACTION_INPUT_INVALID',reason:error.message,history:[]};}
  try{
    if(!compiled){
      const source=readFileSync(new URL('../rcl/agent-action.rcl',import.meta.url),'utf8');
      compiled=compileReality(source);sourceSha256=hash(source);
    }
    const result=await runReality(compiled,{hostAdapters:{observation:{invoke(request){
      if(!Object.hasOwn(facts,request.capability)||request.args.length!==0)throw new Error('Unexpected action observation');
      return facts[request.capability];
    }}}});
    const allowed=result.state['gate.allowed']===true;
    return {allowed,code:allowed?'RCL_AGENT_ACTION_ALLOWED':'RCL_AGENT_ACTION_DENIED',history:result.history,
      programRoot:result.programRoot,stateRoot:result.stateRoot,sourceSha256,factsRoot:hash(JSON.stringify(facts)),
      runtime:'RCL canonical compiler and JavaScript semantic runtime',coverage:'lowered-execution'};
  }catch(error){return {allowed:false,code:'RCL_AGENT_ACTION_EXECUTION_FAILED',reason:error.code??error.message,sourceSha256,history:[]};}
}
