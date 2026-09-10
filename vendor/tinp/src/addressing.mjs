import {TinpError, rootHash} from './canonical.mjs';

const req = (v, code) => { if (typeof v !== 'string' || !v.trim()) throw new TinpError(code); return v.trim(); };
const enc = v => encodeURIComponent(v);
const dec = v => decodeURIComponent(v);

export function makeSubjectAddress({subjectId,nodeId}) {
  subjectId=req(subjectId,'SUBJECT_ID_REQUIRED'); nodeId=req(nodeId,'NODE_ID_REQUIRED');
  const uri=`tinp+subject://${enc(subjectId)}@${enc(nodeId)}`;
  return {format:'tinp.subject-address.v0.2',kind:'subject',subjectId,nodeId,uri,addressRoot:rootHash({kind:'subject',subjectId,nodeId,uri})};
}

export function makeCapabilityAddress({capability,authorityScope=null,payloadProfile=null}) {
  capability=req(capability,'CAPABILITY_REQUIRED');
  const params=new URLSearchParams(); if(authorityScope)params.set('scope',authorityScope); if(payloadProfile)params.set('payload',payloadProfile);
  const q=params.toString(); const uri=`tinp+cap://${enc(capability)}${q?`?${q}`:''}`;
  return {format:'tinp.capability-address.v0.2',kind:'capability',capability,authorityScope,payloadProfile,uri,addressRoot:rootHash({kind:'capability',capability,authorityScope,payloadProfile,uri})};
}

export function parseTinpAddress(uri) {
  req(uri,'ADDRESS_REQUIRED');
  if(uri.startsWith('tinp+subject://')) {
    const raw=uri.slice('tinp+subject://'.length); const at=raw.lastIndexOf('@');
    if(at<=0||at===raw.length-1)throw new TinpError('SUBJECT_ADDRESS_INVALID');
    return makeSubjectAddress({subjectId:dec(raw.slice(0,at)),nodeId:dec(raw.slice(at+1))});
  }
  if(uri.startsWith('tinp+cap://')) {
    const raw=uri.slice('tinp+cap://'.length); const [cap,q='']=raw.split('?',2); const p=new URLSearchParams(q);
    return makeCapabilityAddress({capability:dec(cap),authorityScope:p.get('scope'),payloadProfile:p.get('payload')});
  }
  throw new TinpError('ADDRESS_SCHEME_UNSUPPORTED',{uri});
}
