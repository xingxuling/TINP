"""OPP-owned declarative transform runtime（OPP 自有声明式转换运行时）。"""
from __future__ import annotations
import copy
from typing import Any

ALLOWED_OPS={"rename","select","inject-default","identity"}

class TransformError(ValueError): pass

def validate_operations(operations:list[dict[str,Any]]) -> None:
    for i,op in enumerate(operations):
        if not isinstance(op,dict) or op.get('op') not in ALLOWED_OPS: raise TransformError(f"UNSUPPORTED_TRANSFORM_OP:{i}:{op}")
        if op['op']=='rename' and (not isinstance(op.get('from'),str) or not isinstance(op.get('to'),str)): raise TransformError(f"BAD_RENAME:{i}")
        if op['op']=='select' and (not isinstance(op.get('fields'),list) or any(not isinstance(x,str) for x in op['fields'])): raise TransformError(f"BAD_SELECT:{i}")
        if op['op']=='inject-default' and not isinstance(op.get('field'),str): raise TransformError(f"BAD_DEFAULT:{i}")

def apply_transform(value:Any, operations:list[dict[str,Any]]) -> Any:
    validate_operations(operations)
    out=copy.deepcopy(value)
    for op in operations:
        kind=op['op']
        if kind=='identity': continue
        if not isinstance(out,dict): raise TransformError(f"OBJECT_REQUIRED_FOR:{kind}")
        if kind=='rename':
            src,dst=op['from'],op['to']
            if src not in out: raise TransformError(f"RENAME_SOURCE_MISSING:{src}")
            if dst in out and dst!=src: raise TransformError(f"RENAME_DEST_EXISTS:{dst}")
            out[dst]=out.pop(src)
        elif kind=='select': out={k:out[k] for k in op['fields'] if k in out}
        elif kind=='inject-default': out.setdefault(op['field'],copy.deepcopy(op.get('value')))
    return out
