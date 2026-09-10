"""Cross-project automatic bridge planner（跨项目自动桥规划器）。"""
from __future__ import annotations
import re
from typing import Any
from ..integrity import content_root
from .semantic_model import SemanticInterface, SemanticPort, SemanticReport
from .synthesize import synthesize_bridge


def interface_input_port(interface: SemanticInterface) -> SemanticPort:
    """Lower callable inputs into one object port（把可调用项输入降低为单个对象端口）。"""
    props={}; required=[]; confidence=1.0
    for p in interface.inputs:
        shape=dict(p.shape)
        if not p.required and p.default is not None: shape={**shape,"default":p.default}
        props[p.name]=shape
        if p.required: required.append(p.name)
        confidence=min(confidence,p.confidence or .5)
    return SemanticPort(
        f"{interface.interface_id}.invocation-input", f"{interface.name} invocation input", "input",
        {"type":"object","properties":props,"required":required,"additionalProperties":False},
        "json", (), True, None, confidence if interface.inputs else interface.confidence,
    )


def _rank(plan:dict[str,Any]) -> tuple:
    cls=plan['compatibility']['classification']; order={'exact':0,'structural':1,'lossy':2,'unknown':3,'incompatible':4}
    return (order.get(cls,9),-float(plan['compatibility'].get('confidence',0)),plan['producerPort'],plan['consumerPort'])

def _types(shape):
    t=shape.get('type') if isinstance(shape,dict) else None
    return {t} if isinstance(t,str) else set(t) if isinstance(t,list) else set()
def _norm(s): return re.sub(r'[^a-z0-9]+','',s.lower())

def _worth_comparing(prod:dict, cons:dict) -> bool:
    """Cheap conservative prefilter to avoid quadratic explosions on large repos."""
    pt,ct=_types(prod),_types(cons)
    if not pt or not ct: return False
    if pt.isdisjoint(ct) and not (pt=={'integer'} and 'number' in ct): return False
    if 'object' in pt and 'object' in ct:
        pp=prod.get('properties') or {}; cp=cons.get('properties') or {}; required=cons.get('required') or []
        # An unstructured object cannot prove it can feed a structured callable.
        if required and not pp: return False
        pkeys={_norm(k) for k in pp}; required_keys={_norm(k) for k in required}
        defaultable={_norm(k) for k,v in cp.items() if isinstance(v,dict) and 'default' in v}
        hard=required_keys-defaultable
        if hard and not (hard & pkeys): return False
    return True


def plan_repository_connection(producer: SemanticReport, consumer: SemanticReport, *, allow_lossy:bool=False, max_plans:int=100, max_pairs:int=100_000, include_rejected:bool=False) -> dict[str,Any]:
    """Search producer outputs against consumer invocation inputs with bounded pairing."""
    accepted=[]; rejected=[]; compared=0; prefilter_skipped=0; pair_limit_reached=False
    consumers=[(ci,interface_input_port(ci)) for ci in consumer.interfaces if ci.inputs]
    for pi in producer.interfaces:
        for po in pi.outputs:
            if not po.shape: continue
            for ci,target in consumers:
                if not _worth_comparing(po.shape,target.shape): prefilter_skipped+=1; continue
                if compared>=max_pairs: pair_limit_reached=True; break
                compared+=1
                plan=synthesize_bridge(po,target,producer_authority=pi.authority_required,consumer_authority=ci.authority_required,allow_lossy=allow_lossy)
                wrapped={**plan,"producerInterface":{"interfaceId":pi.interface_id,"operation":pi.operation,"sourcePath":pi.source_path,"confidence":pi.confidence},"consumerInterface":{"interfaceId":ci.interface_id,"operation":ci.operation,"sourcePath":ci.source_path,"confidence":ci.confidence}}
                (accepted if plan['status']=='candidate' else rejected).append(wrapped)
            if pair_limit_reached: break
        if pair_limit_reached: break
    accepted.sort(key=_rank); rejected.sort(key=_rank); accepted=accepted[:max_plans]; rejected=rejected[:max_plans] if include_rejected else []
    core={
        "format":"taowind.opp.auto-connect-report.v0.1","version":"0.2.0-candidate.1",
        "producer":{"sourceId":producer.source_id,"profile":producer.profile,"interfaceCount":len(producer.interfaces)},
        "consumer":{"sourceId":consumer.source_id,"profile":consumer.profile,"interfaceCount":len(consumer.interfaces)},
        "pairsCompared":compared,"prefilterSkipped":prefilter_skipped,"pairLimitReached":pair_limit_reached,"acceptedPlanCount":len(accepted),"plans":accepted,"rejected":rejected,
        "policy":{"allowLossy":bool(allow_lossy),"maxPlans":max_plans,"maxPairs":max_pairs,"authorityPromotion":False,"sourceCodeExecution":False},
        "boundary":"Auto Connect searches static interface shapes only. A candidate plan still requires native invocation adapters and interoperability tests before production use / 自动连接只搜索静态接口形状；候选桥在生产使用前仍需要原生调用适配器与互操作测试。",
    }
    return {**core,"reportRoot":content_root(core)}
