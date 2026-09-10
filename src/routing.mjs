import {RouteGraph} from '../vendor/tinp/src/route-graph.mjs';
import {rootHash,requireThat,ProtocolError} from './identity.mjs';

// TINP is the topology owner. This profile adds bounded, conjunctive path constraints.
export class ConstrainedRoutes {
  constructor(){this.graph=new RouteGraph();this.policy=new Map();}
  connect(a,b,options={}) {
    const p={cost:1,latencyMs:1,energy:1,bandwidth:1000000,region:'local',up:true,...options};
    for(const k of ['cost','latencyMs','energy','bandwidth'])requireThat(Number.isFinite(p[k])&&p[k]>=0,'ROUTE_METRIC_INVALID');
    this.graph.connect(a,b,{cost:p.cost});this.policy.set(`${a}|${b}`,{...p});this.policy.set(`${b}|${a}`,{...p});return this;
  }
  set(a,b,changes){for(const key of [`${a}|${b}`,`${b}|${a}`]){requireThat(this.policy.has(key),'ROUTE_EDGE_UNKNOWN');Object.assign(this.policy.get(key),changes);} }
  plan(source,target,{maxCost=20,maxLatencyMs=1000,maxEnergy=20,region='local',maxHops=4}={}) {
    const found=[];
    const visit=(node,path,cost,latencyMs,energy,bandwidth)=>{
      if(node===target){found.push({path,cost,latencyMs,energy,bandwidth});return;}
      if(path.length>maxHops)return;
      for(const n of this.graph.neighbors(node)){
        const e=this.policy.get(`${node}|${n.nodeId}`);
        if(!e?.up || e.bandwidth<=0 || e.region!==region || path.includes(n.nodeId))continue;
        const c=cost+e.cost,l=latencyMs+e.latencyMs,en=energy+e.energy;
        if(c>maxCost||l>maxLatencyMs||en>maxEnergy)continue;
        visit(n.nodeId,[...path,n.nodeId],c,l,en,Math.min(bandwidth,e.bandwidth));
      }
    };
    visit(source,[source],0,0,0,Number.MAX_SAFE_INTEGER);
    found.sort((a,b)=>a.cost-b.cost||a.latencyMs-b.latencyMs||a.path.join().localeCompare(b.path.join()));
    if(!found.length)throw new ProtocolError('NO_ELIGIBLE_PATH');
    const body={format:'twni.route-plan.v0.1',source,target,...found[0],backups:found.slice(1),region,maxCost,maxLatencyMs,maxEnergy};
    return {...body,routeRoot:rootHash(body)};
  }
}
