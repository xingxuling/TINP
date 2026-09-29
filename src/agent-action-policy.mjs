import path from 'node:path';
import {rootHash} from './identity.mjs';

export const AGENT_ACTION_FORMAT='taowind.opp.agent-action-contract.v0.1';
export const KNOWN_AGENT_EFFECTS=Object.freeze([
  'filesystem.read','filesystem.write','credential.read','credential.write','network.egress',
  'process.spawn','package.install','package.script','registry.publish','git.write',
]);
const RESOURCE_FOR_EFFECT=Object.freeze({
  'filesystem.read':'filesystem','filesystem.write':'filesystem',
  'credential.read':'filesystem','credential.write':'filesystem',
  'network.egress':'network','process.spawn':'commands',
  'package.install':'packages','package.script':'packages',
  'registry.publish':'network','git.write':'network',
});
const RESOURCE_KEYS=Object.freeze(['commands','filesystem','network','packages']);

export class AgentActionPolicyError extends Error{
  constructor(code){super(code);this.code=code;}
}
function fail(ok,code){if(!ok)throw new AgentActionPolicyError(code);}
function strings(value,code){
  fail(Array.isArray(value)&&value.every(x=>typeof x==='string'&&x.length>0),code);
  return [...new Set(value)].sort();
}
function resources(value){
  fail(value&&typeof value==='object'&&!Array.isArray(value),'ACTION_RESOURCES_INVALID');
  fail(Object.keys(value).every(k=>RESOURCE_KEYS.includes(k)),'ACTION_RESOURCE_KEY_UNKNOWN');
  return Object.fromEntries(RESOURCE_KEYS.map(k=>[k,strings(value[k]??[],`ACTION_RESOURCE_INVALID:${k}`)]));
}
function cleanRelative(value){
  if(value.includes('\0')||value.includes('\\'))return null;
  const normalized=path.posix.normalize(value);
  if(normalized.startsWith('/')||normalized==='..'||normalized.startsWith('../')||
      /^[A-Za-z]:/.test(normalized)||normalized.startsWith('~'))return null;
  return normalized;
}
function filesystemBounded(items,prefixes){
  return items.every(item=>{
    const normalized=cleanRelative(item);
    return normalized!==null&&prefixes.some(prefix=>
      normalized===prefix||normalized.startsWith(prefix.endsWith('/')?prefix:prefix+'/'));
  });
}
function exactBounded(items,allowed){
  const set=new Set(allowed);
  return items.every(item=>set.has(item));
}

export function verifyOppActionContract(contract){
  fail(contract&&typeof contract==='object'&&!Array.isArray(contract),'ACTION_CONTRACT_OBJECT_REQUIRED');
  const {contractRoot,...body}=structuredClone(contract);
  fail(body.format===AGENT_ACTION_FORMAT,'ACTION_CONTRACT_FORMAT_INVALID');
  fail(typeof contractRoot==='string'&&contractRoot===rootHash(body),'ACTION_CONTRACT_ROOT_INVALID');
  fail(body.status==='accepted'&&Array.isArray(body.reasons)&&body.reasons.length===0,'ACTION_CONTRACT_NOT_ACCEPTED');
  fail(body.authorityGranted===false&&body.requiresTINP===true,'ACTION_CONTRACT_AUTHORITY_BOUNDARY_INVALID');
  const declared=strings(body.declaredEffects,'ACTION_DECLARED_EFFECTS_INVALID');
  const accepted=strings(body.acceptedEffects,'ACTION_ACCEPTED_EFFECTS_INVALID');
  fail(JSON.stringify(declared)===JSON.stringify(accepted),'ACTION_CONTRACT_EFFECT_DRIFT');
  fail(declared.every(effect=>KNOWN_AGENT_EFFECTS.includes(effect)),'ACTION_CONTRACT_UNKNOWN_EFFECT');
  strings(body.requiredAuthority,'ACTION_REQUIRED_AUTHORITY_INVALID');
  const bound=resources(body.resources);
  for(const effect of declared){
    const key=RESOURCE_FOR_EFFECT[effect];
    if(key)fail(bound[key].length>0,`ACTION_RESOURCE_BINDING_REQUIRED:${effect}`);
  }
  fail(['reversible','compensatable','irreversible'].includes(body.reversibility),'ACTION_REVERSIBILITY_INVALID');
  return {contract:structuredClone(contract),declaredEffects:declared,resources:bound};
}

export function makeAgentActionAdmissionFacts({contract,authorityScopes=[],policy={}}={}){
  let verified;
  try{verified=verifyOppActionContract(contract);}
  catch(error){
    return {
      contractVerified:false,authorityBound:false,effectsAuthorized:false,resourcesBounded:false,
      reversibilityAccepted:false,effectSetComplete:false,reason:error.code??error.message,
      contractRoot:contract?.contractRoot??null,policyRoot:rootHash(policy??{}),
    };
  }

  const scopes=new Set(strings(authorityScopes,'ACTION_AUTHORITY_SCOPES_INVALID'));
  const allowedEffects=new Set(strings(policy.allowedEffects??[],'ACTION_POLICY_EFFECTS_INVALID'));
  const requiredAuthority=strings(contract.requiredAuthority,'ACTION_REQUIRED_AUTHORITY_INVALID');
  const effectSetComplete=verified.declaredEffects.every(effect=>KNOWN_AGENT_EFFECTS.includes(effect));
  const effectsAuthorized=verified.declaredEffects.every(effect=>allowedEffects.has(effect));
  const authorityBound=requiredAuthority.every(scope=>scopes.has(scope));

  const acceptedReversibility=strings(
    policy.acceptedReversibility??['reversible'],
    'ACTION_POLICY_REVERSIBILITY_INVALID',
  );
  const reversibilityAccepted=acceptedReversibility.includes(contract.reversibility);
  const filesystemPrefixes=strings(
    policy.filesystemPrefixes??[],
    'ACTION_POLICY_FILESYSTEM_INVALID',
  ).map(cleanRelative).filter(Boolean);
  const network=strings(policy.network??[],'ACTION_POLICY_NETWORK_INVALID');
  const commands=strings(policy.commands??[],'ACTION_POLICY_COMMANDS_INVALID');
  const packages=strings(policy.packages??[],'ACTION_POLICY_PACKAGES_INVALID');

  let resourcesBounded=true;
  if(verified.resources.filesystem.length)
    resourcesBounded&&=filesystemBounded(verified.resources.filesystem,filesystemPrefixes);
  if(verified.resources.network.length)
    resourcesBounded&&=exactBounded(verified.resources.network,network);
  if(verified.resources.commands.length)
    resourcesBounded&&=exactBounded(verified.resources.commands,commands);
  if(verified.resources.packages.length)
    resourcesBounded&&=exactBounded(verified.resources.packages,packages);

  return {
    contractVerified:true,authorityBound,effectsAuthorized,resourcesBounded,
    reversibilityAccepted,effectSetComplete,reason:null,contractRoot:contract.contractRoot,
    policyRoot:rootHash({
      allowedEffects:[...allowedEffects].sort(),filesystemPrefixes,network,commands,packages,
      acceptedReversibility,
    }),
  };
}

export function verifyObservedAgentAction({contract,observedEffects=[],observedResources={}}={}){
  const verified=verifyOppActionContract(contract);
  const effects=strings(observedEffects,'ACTION_OBSERVED_EFFECTS_INVALID');
  const observed=resources(observedResources);
  const violations=[];
  const declared=new Set(verified.declaredEffects);

  for(const effect of effects){
    if(!KNOWN_AGENT_EFFECTS.includes(effect))violations.push(`UNKNOWN_OBSERVED_EFFECT:${effect}`);
    else if(!declared.has(effect))violations.push(`UNDECLARED_EFFECT:${effect}`);
  }

  if(observed.filesystem.length&&!filesystemBounded(observed.filesystem,verified.resources.filesystem))
    violations.push('FILESYSTEM_RESOURCE_ESCAPE');
  if(observed.network.length&&!exactBounded(observed.network,verified.resources.network))
    violations.push('NETWORK_RESOURCE_ESCAPE');
  if(observed.commands.length&&!exactBounded(observed.commands,verified.resources.commands))
    violations.push('COMMAND_RESOURCE_ESCAPE');
  if(observed.packages.length&&!exactBounded(observed.packages,verified.resources.packages))
    violations.push('PACKAGE_RESOURCE_ESCAPE');

  for(const key of RESOURCE_KEYS){
    if(!observed[key].length)continue;
    const hasDeclaredOwner=verified.declaredEffects.some(effect=>RESOURCE_FOR_EFFECT[effect]===key);
    if(!hasDeclaredOwner)violations.push(`RESOURCE_WITHOUT_DECLARED_EFFECT:${key}`);
  }

  const body={
    format:'twni.agent-action-observation-verification.v1',
    status:violations.length?'FAIL':'PASS',
    contractRoot:contract.contractRoot,
    observedEffects:effects,
    observedResources:observed,
    violations,
    observationTrusted:false,
    boundary:'Checks supplied runtime observations against the OPP contract; it is not independent OS/sandbox attestation.',
  };
  return {...body,verificationRoot:rootHash(body)};
}
