import crypto from 'node:crypto';
export class AAFError extends Error { constructor(code,message=code,details={}){super(message);this.name='AAFError';this.code=code;this.details=details;} }
const keySort=(a,b)=>Buffer.compare(Buffer.from(a,'utf8'),Buffer.from(b,'utf8'));
export const clone=x=>structuredClone(x);
export function canonicalJson(v,path='$'){
  if(v===null)return'null'; if(v===true)return'true'; if(v===false)return'false';
  if(typeof v==='number'){if(!Number.isSafeInteger(v))throw new AAFError('AAF_NON_INTEGER_NUMBER',`Only safe integers at ${path}`);return String(v);}
  if(typeof v==='string')return JSON.stringify(v);
  if(Array.isArray(v))return`[${v.map((x,i)=>canonicalJson(x,`${path}[${i}]`)).join(',')}]`;
  if(typeof v==='object'){return`{${Object.keys(v).sort(keySort).map(k=>`${canonicalJson(k)}:${canonicalJson(v[k],`${path}.${k}`)}`).join(',')}}`;}
  throw new AAFError('AAF_UNSUPPORTED_TYPE',`Unsupported type ${typeof v} at ${path}`);
}
export const hash=v=>crypto.createHash('sha256').update(canonicalJson(v)).digest('hex');
export const without=(o,...fields)=>Object.fromEntries(Object.entries(o).filter(([k])=>!fields.includes(k)));
export const rootOf=(v,...fields)=>hash(without(v,...fields));
export const seal=(v,field)=>{const o=clone(v);delete o[field];o[field]=hash(o);return o};
export const verifySeal=(v,field)=>typeof v?.[field]==='string'&&rootOf(v,field)===v[field];
export const uniq=xs=>[...new Set((xs??[]).map(String))].sort(keySort);
export const isHex64=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
export const matchPattern=(pattern,value)=>{
 const esc=String(pattern).replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');
 return new RegExp(`^${esc}$`).test(String(value));
};
