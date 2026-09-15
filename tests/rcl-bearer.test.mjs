import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateBearerAdmissionGuard} from '../adapters/rcl-bearer-guard.mjs';

test('RCL bearer gate admits only full conjunction',async()=>{const yes=await evaluateBearerAdmissionGuard({endpointPolicyMet:true,meteringPolicyMet:true,routeReachable:true,securityFloorMet:true,privacyFloorMet:true,localFirstSatisfied:true});assert.equal(yes.allowed,true,yes.reason);const no=await evaluateBearerAdmissionGuard({endpointPolicyMet:true,meteringPolicyMet:true,routeReachable:true,securityFloorMet:false,privacyFloorMet:true,localFirstSatisfied:true});assert.equal(no.allowed,false);assert.equal(no.code,'RCL_BEARER_DENIED');});
