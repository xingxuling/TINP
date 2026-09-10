import {TinpError,rootHash} from './canonical.mjs';
export class RouteGraph {
  constructor(){this.edges=new Map();}
  addNode(id){if(!this.edges.has(id))this.edges.set(id,new Map());return this;}
  connect(a,b,{cost=1,bidirectional=true,transport='udp'}={}){if(!a||!b||a===b)throw new TinpError('ROUTE_EDGE_INVALID');this.addNode(a).addNode(b);this.edges.get(a).set(b,{cost,transport});if(bidirectional)this.edges.get(b).set(a,{cost,transport});return this;}
  neighbors(id){return [...(this.edges.get(id)?.entries()??[])].map(([nodeId,x])=>({nodeId,...x}));}
  route(source,target,{maxHops=16}={}){
    if(source===target)return this._result(source,target,[source],0);
    const dist=new Map([[source,0]]), prev=new Map(), q=new Set(this.edges.keys());
    if(!q.has(source)||!q.has(target))throw new TinpError('ROUTE_NODE_UNKNOWN',{source,target});
    while(q.size){let u=null,best=Infinity;for(const n of q){const d=dist.get(n)??Infinity;if(d<best){best=d;u=n;}}if(u===null)break;q.delete(u);if(u===target)break;for(const [v,e] of this.edges.get(u)){if(!q.has(v))continue;const nd=best+e.cost;if(nd<(dist.get(v)??Infinity)){dist.set(v,nd);prev.set(v,u);}}}
    if(!dist.has(target))throw new TinpError('ROUTE_UNREACHABLE',{source,target});
    const path=[];for(let cur=target;cur!==undefined;cur=prev.get(cur)){path.push(cur);if(cur===source)break;}path.reverse();if(path[0]!==source)throw new TinpError('ROUTE_UNREACHABLE');if(path.length-1>maxHops)throw new TinpError('ROUTE_HOP_LIMIT');return this._result(source,target,path,dist.get(target));
  }
  _result(source,target,path,cost){const base={format:'tinp.route.v0.2',source,target,path,hopCount:path.length-1,cost};return {...base,routeRoot:rootHash(base)};}
}
