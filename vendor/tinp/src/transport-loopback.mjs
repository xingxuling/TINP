import {decodeFrame, encodeFrame} from './protocol.mjs';

export class LoopbackEndpoint {
  constructor(id){this.id=id;this.peer=null;this.handlers=new Map();}
  connect(peer){this.peer=peer;peer.peer=this;return this;}
  on(typeName,handler){this.handlers.set(typeName,handler);return this;}
  send(typeName,payload){if(!this.peer)throw new Error('LOOPBACK_NOT_CONNECTED');const bytes=encodeFrame(typeName,payload);queueMicrotask(()=>this.peer.receive(bytes));return bytes.length;}
  receive(bytes){const frame=decodeFrame(bytes);const handler=this.handlers.get(frame.typeName);if(handler)handler(frame.payload,frame);}
}
