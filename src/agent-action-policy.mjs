import { createHash } from 'node:crypto';

export class AgentActionPolicyError extends Error {}

function canonical(value){
  if(value===null || typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys=Object.keys(value).sort();
  return `{${keys.map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export function rootHash(value){return createHash('sha256').update(canonical(value)).digest('hex');}

function arr(value,name){
  if(!Array.isArray(value) || value.some(x=>typeof x!=='string' || !x)) throw new AgentActionPolicyError(`INVALID_${name}`);
  return [...new Set(value)].sort();
}
function safeResource(value){
  if(typeof value!=='string' || !value || value.length>4096 || value.includes('\\') || /%2e/i.test(value) ||
      value.split('/').some(x=>x==='..'||x==='.')) throw new AgentActionPolicyError('RESOURCE_INVALID');
  return value;
}
function scopeMatch(resource,scopes){
  return scopes.some(scope=>scope.endsWith('*') ? resource.startsWith(scope.slice(0,-1)) : resource===scope);
}
function hostMatch(host,hosts){
  if(typeof host!=='string' || !host) return false;
  host=host.toLowerCase().replace(/\.$/,'');
  return hosts.some(raw=>{const p=raw.toLowerCase().replace(/\.$/,''); return p.startsWith('*.') ? host.endsWith(p.slice(1)) && host!==p.slice(2) : host===p;});
}

export function verifyOppActionContract(contract,request){
  if(!contract || typeof contract!=='object' || Array.isArray(contract)) return false;
  const {contractRoot,...body}=contract;
  if(typeof contractRoot!=='string' || !/^[a-f0-9]{64}$/.test(contractRoot) || rootHash(body)!==contractRoot) return false;
  return contract.format==='taowind.opp.agent-action-contract.v0.1' && contract.authorityGranted===false &&
    contract.action===request.action && contract.resource===request.resource &&
    (contract.networkHost??null)===(request.networkHost??null) && contract.sideEffect===request.sideEffect &&
    contract.reversibility===request.reversibility && Array.isArray(contract.requiredAuthority);
}

export function deriveAgentActionFacts({request,lease,session,oppContract,nowMs,evidenceContinuous=true,signatureVerified=true,sessionVerified=true,revoked=false}){
  if(!request || !lease || !session) throw new AgentActionPolicyError('ACTION_CONTEXT_REQUIRED');
  const action=String(request.action||'');
  const resource=safeResource(request.resource);
  const leaseActions=arr(lease.actions??[],'LEASE_ACTIONS');
  const scopes=arr(lease.resourceScopes??[],'RESOURCE_SCOPES');
  const sideEffects=arr(lease.sideEffects??[],'SIDE_EFFECTS');
  const reversibility=arr(lease.reversibility??[],'REVERSIBILITY');
  const authorityScopes=arr(lease.scopes??[],'AUTHORITY_SCOPES');
  const requiredAuthority=Array.isArray(oppContract?.requiredAuthority)?oppContract.requiredAuthority:[];
  const credentialScopes=arr(lease.credentialScopes??[],'CREDENTIAL_SCOPES');
  const networkHosts=arr(lease.networkHosts??[],'NETWORK_HOSTS');
  const executables=arr(lease.executables??[],'EXECUTABLES');
  const packages=arr(lease.packages??[],'PACKAGES');
  return {
    subjectId:String(request.subjectId||''),sessionSubjectId:String(session.subjectId||''),leaseSubjectId:String(lease.subjectId||''),
    actionId:action,resourceId:resource,contractRoot:String(oppContract?.contractRoot||''),
    nowMs,notBeforeMs:lease.notBeforeMs,expiresAtMs:Math.min(lease.expiresAtMs,session.expiresAtMs),
    signatureVerified:Boolean(signatureVerified),sessionVerified:Boolean(sessionVerified),revoked:Boolean(revoked),
    oppContractVerified:verifyOppActionContract(oppContract,request),
    authorityScopeAllowed:requiredAuthority.every(scope=>authorityScopes.includes(scope)),
    actionAllowed:leaseActions.includes(action),resourceAllowed:scopeMatch(resource,scopes),
    sideEffectAllowed:sideEffects.includes(request.sideEffect),reversibilityAllowed:reversibility.includes(request.reversibility),
    credentialBoundaryMet:action!=='credential.read' || scopeMatch(resource,credentialScopes),
    networkBoundaryMet:action!=='network.egress' || hostMatch(request.networkHost,networkHosts),
    processBoundaryMet:action!=='process.spawn' || executables.includes(request.executable),
    packageBoundaryMet:action!=='package.install' || packages.includes(request.packageName),
    evidenceContinuous:Boolean(evidenceContinuous),
  };
}
