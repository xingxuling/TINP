import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRouteAdmissionGuard} from '../adapters/rcl-route-guard.mjs';
const valid=()=>({routeCost:1.25,providerCost:0.75,maxCost:2,routeLatencyMs:1.5,maxLatencyMs:2,
  routeEnergy:0.5,maxEnergy:1,routeRegion:'local',leaseRegion:'local',routeReachable:true,securityFloorMet:true});

test('RCL admits fractional metrics, inclusive budgets and zero local route',async()=>{
  const a=await evaluateRouteAdmissionGuard(valid());assert.equal(a.allowed,true,JSON.stringify(a));assert.equal(a.history.length,2);
  for(const patch of [{routeLatencyMs:2,routeEnergy:1},{routeCost:0,providerCost:0,maxCost:0,routeLatencyMs:0,maxLatencyMs:0,routeEnergy:0,maxEnergy:0}]){
    const b=await evaluateRouteAdmissionGuard({...valid(),...patch});assert.equal(b.allowed,true);assert.equal(b.programRoot,a.programRoot);
  }
});

test('RCL independently rejects each budget, region, reachability and security failure',async()=>{
  const a=await evaluateRouteAdmissionGuard(valid());
  for(const patch of [{routeCost:1.26},{providerCost:0.76},{maxCost:1.99},{routeLatencyMs:2.01},{maxLatencyMs:1.49},
    {routeEnergy:1.01},{maxEnergy:0.49},{routeRegion:'foreign'},{leaseRegion:'foreign'},{routeReachable:false},{securityFloorMet:false}]){
    const b=await evaluateRouteAdmissionGuard({...valid(),...patch});assert.equal(b.code,'RCL_ROUTE_DENIED',JSON.stringify(patch));
    assert.equal(b.allowed,false);assert.equal(b.programRoot,a.programRoot);
  }
});

test('missing fields, nonfinite/unsafe/negative metrics and coercion attempts fail closed',async()=>{
  for(const field of Object.keys(valid())){const v=valid();delete v[field];assert.equal((await evaluateRouteAdmissionGuard(v)).code,'RCL_ROUTE_INPUT_INVALID',field);}
  for(const patch of [{routeCost:NaN},{routeCost:Infinity},{routeCost:-1},{routeCost:Number.MAX_SAFE_INTEGER+1},
    {routeCost:'1.25'},{routeReachable:'true'},{leaseRegion:''},{routeRegion:null}]){
    assert.equal((await evaluateRouteAdmissionGuard({...valid(),...patch})).code,'RCL_ROUTE_INPUT_INVALID');
  }
  const v=valid();Object.defineProperty(v,'securityFloorMet',{get(){throw new Error('accessor executed');}});
  assert.equal((await evaluateRouteAdmissionGuard(v)).code,'RCL_ROUTE_INPUT_INVALID');
});

test('metrics are snapshotted and concurrent route decisions remain isolated',async()=>{
  const v=valid();const pending=evaluateRouteAdmissionGuard(v);v.maxCost=0;assert.equal((await pending).allowed,true);
  const results=await Promise.all(Array.from({length:8},(_,i)=>evaluateRouteAdmissionGuard({...valid(),routeReachable:i%2===0})));
  assert.deepEqual(results.map(r=>r.allowed),[true,false,true,false,true,false,true,false]);
});
