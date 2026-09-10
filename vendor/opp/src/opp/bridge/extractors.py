"""Static extractors（静态提取器）：绝不 import/execute 被扫描源码。"""
from __future__ import annotations
import ast, json, re
from pathlib import Path
from typing import Iterable

KIND_WORDS = ("receipt","ledger","protocol","contract","interface","schema","capability","evidence","bridge","adapter")
ID_RE = re.compile(r"\b(?:rcl|rncs|dwac|opp|taowind)\.[A-Za-z0-9][A-Za-z0-9_.:-]{2,}\b", re.I)
FORMAT_ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.:-]*(?:protocol|contract|interface|schema|capability|evidence|receipt|ledger|bridge)[A-Za-z0-9_.:-]*(?:[._:-]v?\d+(?:[._:-]\d+)*)$", re.I)

def looks_primitive_id(value: str) -> bool:
    value=value.strip()
    return bool(ID_RE.search(value) or (len(value) <= 180 and FORMAT_ID_RE.match(value)))
JS_CONST_RE = re.compile(r"(?:export\s+)?const\s+([A-Z][A-Z0-9_]{2,})\s*=\s*(['\"])([^'\"\n]{3,240})\2")


def classify_text(text: str) -> str | None:
    s=text.lower().replace('_','-')
    for word in KIND_WORDS:
        if word in s:
            return "bridge" if word=="adapter" else word
    return None


def _walk_json(value, prefix="") -> Iterable[tuple[str, object]]:
    if isinstance(value, dict):
        for k,v in value.items():
            key=f"{prefix}.{k}" if prefix else str(k)
            yield key,v; yield from _walk_json(v,key)
    elif isinstance(value, list):
        for i,v in enumerate(value[:200]):
            yield from _walk_json(v,f"{prefix}[{i}]")


def extract_json(text: str, path: Path) -> list[dict]:
    try: obj=json.loads(text)
    except Exception: return []
    out=[]
    if isinstance(obj, dict) and "$schema" in obj:
        native=str(obj.get("$id") or obj.get("title") or path.name)
        out.append({"kind":"schema","native_id":native,"name":str(obj.get("title") or path.stem),"symbol":"$schema","evidence":"json-schema-marker","confidence":0.99})
    for key,val in _walk_json(obj):
        if not isinstance(val,(str,int,float)): continue
        key_kind=classify_text(key)
        val_s=str(val)
        val_kind=classify_text(val_s)
        if key_kind and isinstance(val,str) and 2 < len(val) <= 240 and looks_primitive_id(val_s):
            out.append({"kind":key_kind,"native_id":val_s,"name":key.split('.')[-1],"symbol":key,"evidence":"json-keyword","confidence":0.92})
        elif val_kind and looks_primitive_id(val_s):
            out.append({"kind":val_kind,"native_id":val_s,"name":key.split('.')[-1],"symbol":key,"evidence":"json-native-id","confidence":0.88})
    filename_kind=classify_text(path.name)
    if filename_kind and not out:
        out.append({"kind":filename_kind,"native_id":path.name,"name":path.stem,"symbol":None,"evidence":"filename-hint","confidence":0.66})
    return out


def extract_python(text: str, path: Path) -> list[dict]:
    out=[]
    try: tree=ast.parse(text, filename=str(path))
    except SyntaxError: tree=None
    if tree:
        for node in ast.walk(tree):
            if not isinstance(node,(ast.Assign,ast.AnnAssign)): continue
            targets=node.targets if isinstance(node,ast.Assign) else [node.target]
            value=node.value
            if not isinstance(value,ast.Constant) or not isinstance(value.value,str): continue
            for target in targets:
                if not isinstance(target,ast.Name): continue
                if target.id.upper().endswith('_VERSION'):
                    continue
                kind=classify_text(target.id) or classify_text(value.value)
                explicit = any(token in target.id.upper() for token in ("_FORMAT","_SCHEMA","_PROTOCOL","_CONTRACT","_RECEIPT","_LEDGER","_INTERFACE"))
                if kind and (looks_primitive_id(value.value) or explicit):
                    out.append({"kind":kind,"native_id":value.value,"name":target.id,"symbol":target.id,"line":getattr(node,'lineno',None),"evidence":"python-ast-constant","confidence":0.97})
    return out


def extract_js(text: str, path: Path) -> list[dict]:
    out=[]
    for m in JS_CONST_RE.finditer(text):
        symbol,value=m.group(1),m.group(3)
        if symbol.upper().endswith('_VERSION'):
            continue
        kind=classify_text(symbol) or classify_text(value)
        explicit = any(token in symbol.upper() for token in ("_FORMAT","_SCHEMA","_PROTOCOL","_CONTRACT","_RECEIPT","_LEDGER","_INTERFACE"))
        if kind and (looks_primitive_id(value) or explicit):
            line=text.count('\n',0,m.start())+1
            out.append({"kind":kind,"native_id":value,"name":symbol,"symbol":symbol,"line":line,"evidence":"js-const","confidence":0.98})
    return out


def extract_text(text: str, path: Path) -> list[dict]:
    out=[]
    # Bounded line-level hints only: require both a primitive keyword and a namespaced token.
    for idx,line in enumerate(text.splitlines()[:10000],1):
        kind=classify_text(line)
        if not kind: continue
        ids=ID_RE.findall(line)
        for native in ids[:5]:
            out.append({"kind":kind,"native_id":native,"name":native,"symbol":None,"line":idx,"evidence":"bounded-text-hint","confidence":0.62})
    return out


def extract_candidates(text: str, path: Path) -> list[dict]:
    suffix=path.suffix.lower()
    out=[]
    if suffix=='.json': out.extend(extract_json(text,path))
    if suffix=='.py': out.extend(extract_python(text,path))
    if suffix in {'.js','.mjs','.cjs','.ts','.tsx','.jsx'}: out.extend(extract_js(text,path))
    if suffix in {'.md','.txt','.toml','.yaml','.yml','.rcl','.py','.js','.mjs','.cjs','.ts','.tsx','.jsx'}:
        out.extend(extract_text(text,path))
    # stable de-dup within file
    seen=set(); dedup=[]
    for item in out:
        key=(item['kind'],item['native_id'],item.get('symbol'),item.get('line'))
        if key not in seen:
            seen.add(key); dedup.append(item)
    return dedup
