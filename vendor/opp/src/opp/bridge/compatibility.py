"""Bounded semantic/type compatibility engine（有界语义/类型兼容引擎）。"""
from __future__ import annotations
import re
from typing import Any
from .semantic_model import CompatibilityResult, SemanticPort


def _norm_name(s:str)->str: return re.sub(r'[^a-z0-9]+','',s.lower())
def _types(shape:dict[str,Any])->set[str]:
    t=shape.get('type')
    if isinstance(t,str): return {t}
    if isinstance(t,list): return {str(x) for x in t}
    return set()

def _default_for(shape:dict[str,Any]):
    return (shape.get('default'), True) if 'default' in shape else (None,False)

def _shape_compat(prod:dict[str,Any], cons:dict[str,Any], path:str='$') -> tuple[str,list[dict],list[str],list[str]]:
    """Return class, ops, reasons, missing. Classes: exact/structural/lossy/incompatible/unknown."""
    if prod==cons: return 'exact',[],[f'{path}:exact-shape'],[]
    pt,ct=_types(prod),_types(cons)
    if not pt or not ct: return 'unknown',[],[f'{path}:type-unknown'],[]
    if pt <= {"integer"} and "number" in ct: return 'structural',[],[f'{path}:integer-is-safe-number'],[]
    if pt.isdisjoint(ct): return 'incompatible',[],[f'{path}:type-mismatch:{sorted(pt)}->{sorted(ct)}'],[]
    if 'object' in pt and 'object' in ct:
        pp=prod.get('properties') or {}; cp=cons.get('properties') or {}; required=set(cons.get('required') or [])
        ops=[]; reasons=[]; missing=[]; used=set(); severity='exact'
        for dest,cshape in cp.items():
            source=None
            if dest in pp: source=dest
            else:
                matches=[k for k in pp if k not in used and _norm_name(k)==_norm_name(dest)]
                if len(matches)==1: source=matches[0]
            if source is None:
                default,has_default=_default_for(cshape)
                if dest in required and has_default:
                    ops.append({'op':'inject-default','field':dest,'value':default}); severity='structural'; reasons.append(f'{path}.{dest}:default-injected'); continue
                if dest in required:
                    missing.append(f'{path}.{dest}'); continue
                continue
            used.add(source)
            sub,subops,subreasons,submissing=_shape_compat(pp[source],cshape,f'{path}.{dest}')
            reasons.extend(subreasons); missing.extend(submissing)
            if source!=dest:
                ops.append({'op':'rename','from':source,'to':dest}); severity='structural'; reasons.append(f'{path}.{dest}:normalized-name-rename:{source}->{dest}')
            if sub=='incompatible': return 'incompatible',ops,reasons,missing
            if sub=='unknown' and severity!='lossy': severity='unknown'
            elif sub=='lossy': severity='lossy'
            elif sub=='structural' and severity=='exact': severity='structural'
            ops.extend(subops)
        if missing: return 'incompatible',ops,reasons,missing
        extras=[k for k in pp if k not in used and k not in cp]
        if extras and cons.get('additionalProperties') is False:
            ops.append({'op':'select','fields':sorted(cp.keys())}); severity='lossy'; reasons.append(f'{path}:drop-extra-fields:{extras}')
        return severity,ops,reasons,missing
    if 'array' in pt and 'array' in ct:
        sub,ops,reasons,missing=_shape_compat(prod.get('items',{}),cons.get('items',{}),path+'[]')
        if ops: return 'unknown',[],reasons+[f'{path}:nested-array-transform-not-auto-executed'],missing
        return sub,[],reasons,missing
    # same primitive type but constraints differ => unknown unless consumer accepts producer enum/limits provably
    if pt & ct: return 'structural',[],[f'{path}:same-base-type-constraints-not-proven'],[]
    return 'unknown',[],[f'{path}:compatibility-unknown'],[]


def compare_ports(producer: SemanticPort, consumer: SemanticPort, *, producer_authority=(), consumer_authority=()) -> CompatibilityResult:
    required_auth=set(consumer_authority); available_auth=set(producer_authority); gap=sorted(required_auth-available_auth)
    if gap:
        return CompatibilityResult('incompatible',producer.port_id,consumer.port_id,False,False,1.0,("authority-gap",),(),(),tuple(gap))
    cls,ops,reasons,missing=_shape_compat(producer.shape,consumer.shape)
    p_tags=set(producer.semantic_tags); c_tags=set(consumer.semantic_tags)
    semantic=None
    if p_tags and c_tags:
        semantic=bool(p_tags & c_tags or {_norm_name(x) for x in p_tags}&{_norm_name(x) for x in c_tags})
        if semantic is False and cls not in {'incompatible','unknown'}:
            cls='unknown'; reasons.append('semantic-tags-do-not-overlap')
    conf=min(producer.confidence or .5,consumer.confidence or .5)
    if cls=='exact': conf=min(1.0,conf+.05)
    elif cls=='unknown': conf=min(conf,.55)
    elif cls=='incompatible': conf=max(conf,.8)
    return CompatibilityResult(cls,producer.port_id,consumer.port_id,cls not in {'incompatible','unknown'},semantic,conf,tuple(reasons),tuple(ops),tuple(missing),tuple(gap))
