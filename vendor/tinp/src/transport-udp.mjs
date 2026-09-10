import dgram from 'node:dgram';
import {decodeFrame, encodeFrame} from './protocol.mjs';
import {TinpError} from './canonical.mjs';
const isLoopback=host=>host==='127.0.0.1'||host==='::1'||host==='localhost';
export class UdpTransport {
  constructor({host='127.0.0.1',port=0,unsafeAllowNonLoopback=false}={}){if(!unsafeAllowNonLoopback&&!isLoopback(host))throw new TinpError('UDP_NON_LOOPBACK_REQUIRES_EXPLICIT_UNSAFE_OPT_IN');this.host=host;this.port=port;this.unsafeAllowNonLoopback=unsafeAllowNonLoopback;this.socket=dgram.createSocket(host.includes(':')?'udp6':'udp4');this.handler=null;}
  async bind(){await new Promise((resolve,reject)=>{this.socket.once('error',reject);this.socket.bind(this.port,this.host,()=>{this.socket.off('error',reject);this.port=this.socket.address().port;resolve();});});this.socket.on('message',(msg,rinfo)=>{try{this.handler?.(decodeFrame(msg),rinfo);}catch(e){this.handler?.({error:e},rinfo);}});return this;}
  onFrame(handler){this.handler=handler;return this;}
  async send(host,port,type,payload){if(!isLoopback(host)&&!this.unsafeAllowNonLoopback)throw new TinpError('UDP_REMOTE_REQUIRES_EXPLICIT_UNSAFE_OPT_IN');const data=encodeFrame(type,payload);await new Promise((resolve,reject)=>this.socket.send(data,port,host,e=>e?reject(e):resolve()));return data.length;}
  endpoint(){return {transport:'udp',host:this.host,port:this.port};}
  close(){this.socket.close();}
}
