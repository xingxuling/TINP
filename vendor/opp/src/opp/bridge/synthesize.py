"""Automatic declarative bridge synthesis（自动声明式桥合成）。"""
from __future__ import annotations
import hashlib
from typing import Any
from ..integrity import content_root
from .compatibility import compare_ports
from .semantic_model import SemanticPort
from .transform import validate_operations


def synthesize_bridge(producer: SemanticPort, consumer: SemanticPort, *, producer_authority=(), consumer_authority=(), allow_lossy:bool=False) -> dict[str,Any]:
    comp=compare_ports(producer,consumer,producer_authority=producer_authority,consumer_authority=consumer_authority)
    allowed=comp.classification in {'exact','structural'} or (allow_lossy and comp.classification=='lossy')
    operations=list(comp.operations)
    if comp.classification=='exact': operations=[{'op':'identity'}]
    if allowed: validate_operations(operations)
    raw=f"{producer.port_id}\0{consumer.port_id}\0{content_root(comp.to_dict())}".encode('utf-8')
    bridge_id='bridge-plan-'+hashlib.sha256(raw).hexdigest()[:24]
    core={
        "format":"taowind.opp.auto-bridge-plan.v0.1",
        "version":"0.2.0-candidate.1",
        "bridgeId":bridge_id,
        "status":"candidate" if allowed else "rejected",
        "producerPort":producer.port_id,
        "consumerPort":consumer.port_id,
        "compatibility":comp.to_dict(),
        "operations":operations if allowed else [],
        "executionModel":"opp-declarative-json-transform" if allowed else "none",
        "authority":{"required":list(consumer_authority),"available":list(producer_authority),"promotionPerformed":False},
        "safety":{"sourceCodeExecution":False,"arbitraryCodeGeneration":False,"informationInvention":False,"authorityInvention":False,"lossyAllowed":bool(allow_lossy)},
        "boundary":"Generated plans only transform supplied JSON-like values. They cannot create missing required information, privileges, native runtime support, or semantic truth / 生成计划只转换已提供的 JSON 类数据；不能创造缺失的必需信息、权限、原生运行支持或语义真实性。",
    }
    return {**core,"planRoot":content_root(core)}
