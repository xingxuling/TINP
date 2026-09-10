import fs from 'node:fs';
import path from 'node:path';
import {rootHash, requireThat, clone,seal,authentic} from './identity.mjs';
export const GENESIS = '0'.repeat(64);
export function verifyLedger(events,{publicKey}={}) {
  let previousRoot = GENESIS;
  for (let i=0; i<events.length; i++) {
    const {eventRoot,signature,...body}=events[i];
    requireThat(body.sequence===i && body.previousRoot===previousRoot && rootHash(body)===eventRoot,'EVIDENCE_CHAIN_INVALID');
    if(publicKey)requireThat(authentic({body,root:eventRoot,signature},publicKey),'EVIDENCE_SIGNATURE_INVALID');
    previousRoot=eventRoot;
  }
  return previousRoot;
}
export class EvidenceLedger {
  constructor(file,{identity}={}) {
    this.identity=identity;
    this.file=file; fs.mkdirSync(path.dirname(file),{recursive:true});
    const text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
    this.events=text?text.trimEnd().split('\n').map(line=>JSON.parse(line)):[];
    verifyLedger(this.events,{publicKey:identity?.publicKey});
  }
  get root(){return this.events.at(-1)?.eventRoot??GENESIS;}
  append(type,detail) {
    const body={format:'twni.evidence.v0.1',sequence:this.events.length,previousRoot:this.root,
      type,time:new Date().toISOString(),classification:'observed-local',detail:clone(detail)};
    const event={...body,eventRoot:rootHash(body)};
    if(this.identity)event.signature=seal(body,this.identity.privateKey).signature;
    const fd=fs.openSync(this.file,'a');
    try {fs.writeSync(fd,JSON.stringify(event)+'\n');fs.fsyncSync(fd);} finally{fs.closeSync(fd);}
    this.events.push(event);return clone(event);
  }
}
