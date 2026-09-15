import net from 'node:net';
import tls from 'node:tls';
import {UdpTransport} from '../vendor/tinp/src/transport-udp.mjs';
import {encodeFrame,decodeFrame} from '../vendor/tinp/src/protocol.mjs';
import {authentic,seal,id,ProtocolError,requireThat} from './identity.mjs';
import {endpointPolicy} from './bearer-policy.mjs';

const MAX_FRAME=60000;
const MAX_INFLIGHT=64;
const isLegacyLoopback=host=>host==='127.0.0.1'||host==='::1'||host==='localhost';
export class LocalTransport {
  constructor({nodeId,identity,kind='udp',tlsOptions=null,bindHost='127.0.0.1',advertiseHost=null,networkPolicy=null}) {
    requireThat(['udp','tcp','tls'].includes(kind),'TRANSPORT_UNSUPPORTED');
    if(kind==='tls')requireThat(tlsOptions&&typeof tlsOptions.key==='string'&&typeof tlsOptions.cert==='string','TLS_CREDENTIALS_REQUIRED');
    if(!isLegacyLoopback(bindHost)){
      requireThat(networkPolicy,'NON_LOOPBACK_BIND_REQUIRES_POLICY');
      const decision=endpointPolicy({host:bindHost,metered:false},networkPolicy);
      requireThat(decision.allowed,'NON_LOOPBACK_BIND_DENIED');
    }
    this.nodeId=nodeId;this.identity=identity;this.kind=kind;this.tlsOptions=tlsOptions;
    this.bindHost=bindHost;this.advertiseHost=advertiseHost??bindHost;this.networkPolicy=networkPolicy;
    this.peers={};this.pending=new Map();this.sockets=new Set();
    this.metrics={sentFrames:0,receivedFrames:0,sentBytes:0,invalidFrames:0,overloadRejected:0,secureConnections:0,tlsVersion:null,tlsCipher:null,policyRejected:0};this.blocked=new Set();this.bandwidth=0;
    this.activeHandlers=0;this.closed=false;this.lifetime=new AbortController();
  }
  async bind(){
    if(this.kind==='udp'){
      this.udp=await new UdpTransport({host:this.bindHost,unsafeAllowNonLoopback:!isLegacyLoopback(this.bindHost)}).bind();
      this.udp.onFrame((frame,rinfo)=>{if(frame.error){this.metrics.invalidFrames++;return;}this.receive(frame.payload).catch(()=>{this.metrics.invalidFrames++;});});
      this.port=this.udp.port;
    }else{
      const onConnection=socket=>{
        if(this.sockets.size>=MAX_INFLIGHT){this.metrics.overloadRejected++;socket.destroy();return;}
        this.sockets.add(socket);let bytes=Buffer.alloc(0);
        socket.setTimeout(2000,()=>socket.destroy());
        if(this.kind==='tls')this.recordTls(socket);
        socket.on('error',()=>{});socket.on('close',()=>this.sockets.delete(socket));
        socket.on('data',chunk=>{
          bytes=Buffer.concat([bytes,chunk]);
          if(bytes.length>MAX_FRAME){this.metrics.invalidFrames++;socket.destroy();return;}
          if(bytes.length>=12){const length=bytes.readUInt32BE(8)+12;
            if(length>MAX_FRAME){this.metrics.invalidFrames++;socket.destroy();return;}
            if(bytes.length===length){try{const frame=decodeFrame(bytes);this.receive(frame.payload).catch(()=>{this.metrics.invalidFrames++;});}catch{this.metrics.invalidFrames++;}socket.end();}
          }
        });
      };
      if(this.kind==='tls'){
        const options={...this.tlsOptions,minVersion:this.tlsOptions.minVersion??'TLSv1.3'};
        this.server=tls.createServer(options,onConnection);this.server.on('tlsClientError',()=>{this.metrics.invalidFrames++;});
      }else this.server=net.createServer(onConnection);
      await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,this.bindHost,resolve);});
      this.port=this.server.address().port;
    }
    return this;
  }
  endpoint(){
    const endpoint={host:this.advertiseHost,port:this.port,transport:this.kind};
    if(this.kind==='tls')endpoint.tls={ca:this.tlsOptions.cert,servername:this.tlsOptions.servername??'tinp-loopback'};
    return endpoint;
  }
  recordTls(socket){
    this.metrics.secureConnections++;
    try{this.metrics.tlsVersion=socket.getProtocol?.()??null;this.metrics.tlsCipher=socket.getCipher?.().name??null;}catch{}
  }
  assertPeerPolicy(peer){
    if(!this.networkPolicy)return;
    const decision=endpointPolicy(peer.endpoint,this.networkPolicy);
    if(!decision.allowed){this.metrics.policyRejected++;throw new ProtocolError(decision.code);}
  }
  async send(peerId,message,requestSignal){
    requireThat(!this.closed,'TRANSPORT_CLOSED');
    const signal=requestSignal?AbortSignal.any([requestSignal,this.lifetime.signal]):this.lifetime.signal;
    requireThat(!signal.aborted,'REQUEST_CANCELLED');
    const peer=this.peers[peerId];requireThat(peer && !this.blocked.has(peerId),'LINK_UNAVAILABLE');
    this.assertPeerPolicy(peer);
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
      let options={host:peer.endpoint.host,port:peer.endpoint.port};
      const readyEvent=this.kind==='tls'?'secureConnect':'connect';
      if(this.kind==='tls'){
        const peerTls=peer.endpoint.tls;requireThat(peerTls&&typeof peerTls.ca==='string','TLS_PEER_CA_REQUIRED');
        options={...options,ca:peerTls.ca,servername:peerTls.servername??'tinp-loopback',rejectUnauthorized:true,minVersion:'TLSv1.3'};
      }
      const socket=this.kind==='tls'?tls.connect(options):net.createConnection(options);this.sockets.add(socket);
      socket.setTimeout(1000,()=>socket.destroy(new ProtocolError('TCP_TIMEOUT')));
      socket.once('error',reject);socket.once('close',()=>this.sockets.delete(socket));
      socket.once(readyEvent,()=>{if(this.kind==='tls')this.recordTls(socket);socket.end(bytes,resolve);});
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
