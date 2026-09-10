import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileReality} from '../vendor/rcl/src/compiler.mjs';
import {runReality} from '../vendor/rcl/src/runtime.mjs';

const numberFields=['routeCost','providerCost','maxCost','routeLatencyMs','maxLatencyMs','routeEnergy','maxEnergy'];
const textFields=['routeRegion','leaseRegion'];
const truthFields=['routeReachable','securityFloorMet'];
const fields=[...numberFields,...textFields,...truthFields];
const hash=value=>createHash('sha256').update(value).digest('hex');
let compiled,sourceSha256;

function snapshot(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Input must be an object');
  const facts={};
  for(const field of fields){
    const d=Object.getOwnPropertyDescriptor(input,field);
    if(!d||!Object.hasOwn(d,'value'))throw new TypeError(`Missing data field: ${field}`);
    facts[field]=d.value;
  }
  for(const field of numberFields)if(typeof facts[field]!=='number'||!Number.isFinite(facts[field])||facts[field]<0||facts[field]>Number.MAX_SAFE_INTEGER)throw new TypeError(`Invalid metric: ${field}`);
  for(const field of textFields)if(typeof facts[field]!=='string'||facts[field].trim().length===0||facts[field].length>4096)throw new TypeError(`Invalid text: ${field}`);
  for(const field of truthFields)if(typeof facts[field]!=='boolean')throw new TypeError(`Invalid truth: ${field}`);
  return Object.freeze(facts);
}

/** Only trusted topology measurements, authenticated lease limits and provider facts belong here. */
export async function evaluateRouteAdmissionGuard(input){
  let facts;
  try{facts=snapshot(input);}catch(error){return {allowed:false,code:'RCL_ROUTE_INPUT_INVALID',reason:error.message,history:[]};}
  try{
    if(!compiled){
      const source=readFileSync(new URL('../rcl/route.rcl',import.meta.url),'utf8');
      const program=compileReality(source);sourceSha256=hash(source);compiled=program;
    }
    const result=await runReality(compiled,{hostAdapters:{observation:{invoke(request){
      if(!fields.includes(request.capability)||request.args.length!==0)throw new Error('Unexpected route observation');
      return facts[request.capability];
    }}}});
    const allowed=result.state['route.allowed']===true;
    return {allowed,code:allowed?'RCL_ROUTE_ALLOWED':'RCL_ROUTE_DENIED',history:result.history,
      programRoot:result.programRoot,stateRoot:result.stateRoot,sourceSha256,factsRoot:hash(JSON.stringify(facts)),
      runtime:'RCL canonical compiler and JavaScript semantic runtime',coverage:'lowered-execution'};
  }catch(error){return {allowed:false,code:'RCL_ROUTE_EXECUTION_FAILED',reason:error.code??error.message,sourceSha256,history:[]};}
}
