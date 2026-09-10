import net from 'node:net';
import {UdpTransport} from '../vendor/tinp/src/transport-udp.mjs';
import {encodeFrame,decodeFrame} from '../vendor/tinp/src/protocol.mjs';
import {authentic,seal,id,ProtocolError,requireThat} from './identity.mjs';

const MAX_FRAME=60000;
const MAX_INFLIGHT=64;
export class LocalTransport {
  constructor({nodeId,identity,kind='udp'}) {
    requireThat(['udp','tcp'].includes(kind),'TRANSPORT_UNSUPPORTED');
    this.nodeId=nodeId;this.identity=identity;this.kind=kind;this.peers={};this.pending=new Map();this.sockets=new Set();
    this.metrics={sentFrames:0,receivedFrames:0,sentBytes:0,invalidFrames:0,overloadRejected:0};this.blocked=new Set();this.bandwidth=0;
    this.activeHandlers=0;this.closed=false;this.lifetime=new AbortController();
  }
  async bind(){
    if(this.kind==='udp'){
      this.udp=await new UdpTransport().bind();
      this.udp.onFrame((frame,rinfo)=>{if(frame.error){this.metrics.invalidFrames++;return;}this.receive(frame.payload).catch(()=>{this.metrics.invalidFrames++;});});
      this.port=this.udp.port;
    }else{
      this.server=net.createServer(socket=>{
        if(this.sockets.size>=MAX_INFLIGHT){this.metrics.overloadRejected++;socket.destroy();return;}
        this.sockets.add(socket);let bytes=Buffer.alloc(0);
        socket.setTimeout(2000,()=>socket.destroy());
        socket.on('error',()=>{});socket.on('close',()=>this.sockets.delete(socket));
        socket.on('data',chunk=>{
          bytes=Buffer.concat([bytes,chunk]);
          if(bytes.length>MAX_FRAME){this.metrics.invalidFrames++;socket.destroy();return;}
          if(bytes.length>=12){const length=bytes.readUInt32BE(8)+12;
            if(length>MAX_FRAME){this.metrics.invalidFrames++;socket.destroy();return;}
            if(bytes.length===length){try{const frame=decodeFrame(bytes);this.receive(frame.payload).catch(()=>{this.metrics.invalidFrames++;});}catch{this.metrics.invalidFrames++;}socket.end();}
          }
        });
      });
      await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,'127.0.0.1',resolve);});
      this.port=this.server.address().port;
    }
    return this;
  }
  endpoint(){return {host:'127.0.0.1',port:this.port,transport:this.kind};}
  async send(peerId,message,requestSignal){
    requireThat(!this.closed,'TRANSPORT_CLOSED');
    const signal=requestSignal?AbortSignal.any([requestSignal,this.lifetime.signal]):this.lifetime.signal;
    requireThat(!signal.aborted,'REQUEST_CANCELLED');
    const peer=this.peers[peerId];requireThat(peer && !this.blocked.has(peerId),'LINK_UNAVAILABLE');
    const signed=seal({sender:this.nodeId,recipient:peerId,...message},this.identity.privateKey);
    const bytes=encodeFrame('DATA',signed);requireThat(bytes.length<=MAX_FRAME,'FRAME_TOO_LARGE');
    if(this.bandwidth>0)await new Promise((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);reject(new ProtocolError('REQUEST_CANCELLED'));};
      const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},Math.ceil(bytes.length*1000/this.bandwidth));
      signal.addEventListener('abort',abort,{once:true});
    });
    requireThat(!signal.aborted&&!this.closed,'REQUEST_CANCELLED');
    if(this.kind==='udp')await this.udp.send(peer.endpoint.host,peer.endpoint.port,'DATA',signed);
    else await new Promise((resolve,reject)=>{
      if(this.sockets.size>=MAX_INFLIGHT){this.metrics.overloadRejected++;reject(new ProtocolError('TRANSPORT_OVERLOADED'));return;}
      const socket=net.createConnection({host:peer.endpoint.host,port:peer.endpoint.port});this.sockets.add(socket);
      socket.setTimeout(1000,()=>socket.destroy(new ProtocolError('TCP_TIMEOUT')));
      socket.once('error',reject);socket.once('close',()=>this.sockets.delete(socket));
      socket.once('connect',()=>socket.end(bytes,resolve));
    });
    this.metrics.sentFrames++;this.metrics.sentBytes+=bytes.length;
  }
  async receive(envelope){
    const msg=envelope?.body;const peer=this.peers[msg?.sender];
    if(!peer||this.blocked.has(msg.sender)||msg.recipient!==this.nodeId||!authentic(envelope,peer.publicKey)){
      this.metrics.invalidFrames++;return;
    }
    this.metrics.receivedFrames++;
    if(msg.kind==='response'){
      const p=this.pending.get(msg.rpcId);if(!p||p.peerId!==msg.sender)return;
      clearTimeout(p.timer);this.pending.delete(msg.rpcId);
      if(msg.ok)p.resolve(msg.value);else p.reject(new ProtocolError(msg.error));return;
    }
    if(msg.kind!=='request')return;
    if(this.activeHandlers>=MAX_INFLIGHT){this.metrics.overloadRejected++;return;}
    this.activeHandlers++;
    try{const value=await this.handler(msg.value,msg.sender);await this.send(msg.sender,{kind:'response',rpcId:msg.rpcId,ok:true,value});}
    catch(error){await this.send(msg.sender,{kind:'response',rpcId:msg.rpcId,ok:false,error:error.code??'REMOTE_EXECUTION_ERROR'}).catch(()=>{});}
    finally{this.activeHandlers--;}
  }
  request(peerId,value,timeoutMs=2000){
    requireThat(!this.closed,'TRANSPORT_CLOSED');requireThat(this.pending.size<MAX_INFLIGHT,'TRANSPORT_OVERLOADED');
    const rpcId=id('rpc');
    return new Promise((resolve,reject)=>{
      const cancellation=new AbortController();
      const timer=setTimeout(()=>{this.pending.delete(rpcId);cancellation.abort();reject(new ProtocolError('TRANSPORT_TIMEOUT'));},timeoutMs);
      this.pending.set(rpcId,{peerId,timer,resolve,reject,cancellation});
      this.send(peerId,{kind:'request',rpcId,value},cancellation.signal).catch(e=>{clearTimeout(timer);this.pending.delete(rpcId);reject(e);});
    });
  }
  async close(){
    this.closed=true;this.lifetime.abort();
    for(const p of this.pending.values()){clearTimeout(p.timer);p.cancellation.abort();p.reject(new ProtocolError('TRANSPORT_CLOSED'));}this.pending.clear();
    for(const socket of this.sockets)socket.destroy();
    if(this.udp)this.udp.close();if(this.server)await new Promise(r=>this.server.close(r));
  }
}
