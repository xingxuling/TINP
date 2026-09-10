import {TinpError} from './canonical.mjs';
class ProviderRegistry {
  constructor(kind){this.kind=kind;this.providers=new Map();}
  register(p){if(!p?.id)throw new TinpError(`${this.kind.toUpperCase()}_PROVIDER_ID_REQUIRED`);if(this.providers.has(p.id))throw new TinpError(`${this.kind.toUpperCase()}_PROVIDER_DUPLICATE`);this.providers.set(p.id,{...p});return p;}
  get(id){const p=this.providers.get(id);if(!p)throw new TinpError(`${this.kind.toUpperCase()}_PROVIDER_UNKNOWN`,{id});return p;}
  choose(predicate=()=>true){const p=[...this.providers.values()].filter(predicate).sort((a,b)=>(b.priority??0)-(a.priority??0)||a.id.localeCompare(b.id))[0];if(!p)throw new TinpError(`${this.kind.toUpperCase()}_PROVIDER_UNAVAILABLE`);return p;}
}
export class TransportProviderRegistry extends ProviderRegistry { constructor(){super('transport');} }
export class SecurityProviderRegistry extends ProviderRegistry { constructor(){super('security');} requireProductionSafe(id){const p=this.get(id);if(!p.productionSafe)throw new TinpError('SECURITY_PROVIDER_NOT_PRODUCTION_SAFE',{id});return p;} }
export function makeNoneTestSecurityProvider(){return {id:'none-test',productionSafe:false,properties:['integrity:none','confidentiality:none','identity:none'],priority:-100};}
