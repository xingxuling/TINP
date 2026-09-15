import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileReality} from '../vendor/rcl/src/compiler.mjs';
import {runReality} from '../vendor/rcl/src/runtime.mjs';
const fields=['endpointPolicyMet','meteringPolicyMet','routeReachable','securityFloorMet','privacyFloorMet','localFirstSatisfied'];
const hash=value=>createHash('sha256').update(value).digest('hex');
let compiled,sourceSha256;
function snapshot(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Input must be an object');
  const facts={};
  for(const field of fields){const d=Object.getOwnPropertyDescriptor(input,field);if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='boolean')throw new TypeError(`Invalid truth field: ${field}`);facts[field]=d.value;}
  return Object.freeze(facts);
}
export async function evaluateBearerAdmissionGuard(input){
  let facts;try{facts=snapshot(input);}catch(error){return {allowed:false,code:'RCL_BEARER_INPUT_INVALID',reason:error.message,history:[]};}
  try{
    if(!compiled){const source=readFileSync(new URL('../rcl/bearer.rcl',import.meta.url),'utf8');compiled=compileReality(source);sourceSha256=hash(source);}
    const result=await runReality(compiled,{hostAdapters:{observation:{invoke(request){if(!fields.includes(request.capability)||request.args.length!==0)throw new Error('Unexpected bearer observation');return facts[request.capability];}}}});
    const allowed=result.state['bearer.allowed']===true;
    return {allowed,code:allowed?'RCL_BEARER_ALLOWED':'RCL_BEARER_DENIED',history:result.history,programRoot:result.programRoot,stateRoot:result.stateRoot,sourceSha256,factsRoot:hash(JSON.stringify(facts)),runtime:'RCL canonical compiler and JavaScript semantic runtime',coverage:'lowered-execution'};
  }catch(error){return {allowed:false,code:'RCL_BEARER_EXECUTION_FAILED',reason:error.code??error.message,sourceSha256,history:[]};}
}
