"""Non-executing semantic signature extractors（不执行源码的语义签名提取器）。"""
from __future__ import annotations
import ast, hashlib, json, re
from pathlib import Path
from typing import Any
from .semantic_model import SemanticInterface, SemanticPort


def _sid(path: str, name: str, line: int | None) -> str:
    raw=f"{path}\0{name}\0{line or 0}".encode('utf-8')
    return f"semantic-{hashlib.sha256(raw).hexdigest()[:24]}"


def _unknown() -> dict[str, Any]: return {}


def _py_ann(node: ast.AST | None) -> dict[str, Any]:
    if node is None: return _unknown()
    if isinstance(node, ast.Name):
        return {"int":{"type":"integer"},"float":{"type":"number"},"str":{"type":"string"},"bool":{"type":"boolean"},"dict":{"type":"object"},"list":{"type":"array"},"None":{"type":"null"}}.get(node.id,{})
    if isinstance(node, ast.Constant) and node.value is None: return {"type":"null"}
    if isinstance(node, ast.Subscript):
        base = node.value.id if isinstance(node.value,ast.Name) else node.value.attr if isinstance(node.value,ast.Attribute) else ""
        if base in {"list","List","Sequence","Iterable","tuple","Tuple"}:
            return {"type":"array","items":_py_ann(node.slice)}
        if base in {"dict","Dict","Mapping"}: return {"type":"object"}
        if base in {"Optional"}:
            inner=_py_ann(node.slice); t=inner.get("type")
            if isinstance(t,str): return {**inner,"type":[t,"null"]}
            return inner
        if base in {"Union"}: return {}
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        left,right=_py_ann(node.left),_py_ann(node.right); types=[]
        for s in (left,right):
            t=s.get('type'); types.extend(t if isinstance(t,list) else [t] if t else [])
        return {"type":sorted(set(types))} if types else {}
    return {}


def _literal_default(node: ast.AST | None):
    if node is None: return None, False
    try: return ast.literal_eval(node), True
    except Exception: return None, False


def _effects_py(fn: ast.AST) -> tuple[str,...]:
    effects=set()
    for node in ast.walk(fn):
        if isinstance(node,ast.Call):
            name=""
            if isinstance(node.func,ast.Name): name=node.func.id
            elif isinstance(node.func,ast.Attribute):
                parts=[]; cur=node.func
                while isinstance(cur,ast.Attribute): parts.append(cur.attr); cur=cur.value
                if isinstance(cur,ast.Name): parts.append(cur.id)
                name='.'.join(reversed(parts))
            if name in {"subprocess.run","subprocess.Popen","os.system"}: effects.add("process.exec")
            if name.endswith(("write_text","write_bytes","unlink","remove","rename","replace","mkdir","rmdir")): effects.add("filesystem.write")
            if name=="open" and len(node.args)>=2:
                mode,_=_literal_default(node.args[1])
                if isinstance(mode,str) and any(x in mode for x in ('w','a','x','+')): effects.add("filesystem.write")
            if any(token in name.lower() for token in ("requests.post","requests.put","requests.patch","requests.delete","httpx.post","httpx.put","httpx.patch","httpx.delete")): effects.add("network.write")
    return tuple(sorted(effects))


def extract_python_semantics(text: str, rel: str, digest: str) -> list[SemanticInterface]:
    try: tree=ast.parse(text, filename=rel)
    except SyntaxError: return []
    out=[]
    for node in tree.body:
        if not isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)): continue
        args=[]; positional=list(node.args.posonlyargs)+list(node.args.args)
        defaults=[None]*(len(positional)-len(node.args.defaults))+list(node.args.defaults)
        for arg,default_node in zip(positional,defaults):
            if arg.arg in {"self","cls"}: continue
            shape=_py_ann(arg.annotation); default,has_default=_literal_default(default_node)
            args.append(SemanticPort(f"{node.name}.in.{arg.arg}",arg.arg,"input",shape,"data",(arg.arg.lower(),),not has_default,default if has_default else None,0.95 if shape else 0.55))
        for arg,default_node in zip(node.args.kwonlyargs,node.args.kw_defaults):
            shape=_py_ann(arg.annotation); default,has_default=_literal_default(default_node)
            args.append(SemanticPort(f"{node.name}.in.{arg.arg}",arg.arg,"input",shape,"data",(arg.arg.lower(),),default_node is None,default if has_default else None,0.95 if shape else 0.55))
        ret=_py_ann(node.returns)
        output=SemanticPort(f"{node.name}.out.return","return","output",ret,"data",(node.name.lower(),),True,None,0.95 if ret else 0.45)
        conf=0.5
        known=sum(1 for p in args if p.shape)+(1 if ret else 0); total=max(1,len(args)+1)
        conf=min(0.98,0.48+0.5*(known/total))
        out.append(SemanticInterface(_sid(rel,node.name,node.lineno),node.name,"callable",node.name,tuple(args),(output,),_effects_py(node),(),rel,digest,node.lineno,"python-ast-signature",conf,("python-ast-signature",),"unverified"))
    return out

TS_FUNC_RE=re.compile(r"(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?::\s*([^\{=>\n]+))?",re.M)
TS_ARROW_RE=re.compile(r"(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*([^=\n]+))?\s*=>",re.M)

def _ts_type(text: str | None) -> dict[str, Any]:
    if not text: return {}
    s=text.strip().rstrip(';').strip()
    if s in {"string"}: return {"type":"string"}
    if s in {"number"}: return {"type":"number"}
    if s in {"boolean"}: return {"type":"boolean"}
    if s in {"void","undefined"}: return {"type":"null"}
    if s.endswith('[]'): return {"type":"array","items":_ts_type(s[:-2])}
    m=re.fullmatch(r"Array<(.+)>",s)
    if m: return {"type":"array","items":_ts_type(m.group(1))}
    if s.startswith('{') and s.endswith('}'):
        props={}; required=[]
        for part in s[1:-1].split(';'):
            if ':' not in part: continue
            k,v=part.split(':',1); k=k.strip(); opt=k.endswith('?'); k=k.rstrip('?').strip()
            if k: props[k]=_ts_type(v); required += [] if opt else [k]
        return {"type":"object","properties":props,"required":required}
    return {}

def _ts_params(raw: str, fn: str) -> tuple[SemanticPort,...]:
    ports=[]
    for part in [x.strip() for x in raw.split(',') if x.strip()]:
        m=re.match(r"([A-Za-z_$][\w$]*)(\?)?\s*(?::\s*(.+))?$",part)
        if not m: continue
        name,opt,typ=m.group(1),m.group(2),m.group(3); shape=_ts_type(typ)
        ports.append(SemanticPort(f"{fn}.in.{name}",name,"input",shape,"data",(name.lower(),),not bool(opt),None,0.92 if shape else 0.5))
    return tuple(ports)

def extract_js_semantics(text: str, rel: str, digest: str) -> list[SemanticInterface]:
    out=[]; seen=set()
    for rx,kind in ((TS_FUNC_RE,"js-ts-function"),(TS_ARROW_RE,"js-ts-arrow")):
        for m in rx.finditer(text):
            name=m.group(1)
            if (name,m.start()) in seen: continue
            seen.add((name,m.start())); line=text.count('\n',0,m.start())+1
            inputs=_ts_params(m.group(2),name); ret=_ts_type(m.group(3)); outp=SemanticPort(f"{name}.out.return","return","output",ret,"data",(name.lower(),),True,None,0.9 if ret else 0.4)
            known=sum(1 for p in inputs if p.shape)+(1 if ret else 0); total=max(1,len(inputs)+1); conf=min(.95,.42+.5*(known/total))
            out.append(SemanticInterface(_sid(rel,name,line),name,"callable",name,inputs,(outp,),(),(),rel,digest,line,kind,conf,(kind,),"unverified"))
    return out


def extract_json_schema_semantics(text: str, rel: str, digest: str) -> list[SemanticInterface]:
    try: obj=json.loads(text)
    except Exception: return []
    if not isinstance(obj,dict) or "$schema" not in obj: return []
    name=str(obj.get('title') or obj.get('$id') or Path(rel).stem)
    port=SemanticPort(f"{name}.shape",name,"output",obj,"json",("schema",name.lower()),True,None,0.99)
    return [SemanticInterface(_sid(rel,name,1),name,"schema",name,(),(port,),(),(),rel,digest,1,"json-schema",0.99,("json-schema",),"declaration-only")]


def extract_semantic_interfaces(text: str, rel: str, digest: str, suffix: str) -> list[SemanticInterface]:
    suffix=suffix.lower(); out=[]
    if suffix=='.py': out.extend(extract_python_semantics(text,rel,digest))
    if suffix in {'.js','.mjs','.cjs','.ts','.tsx','.jsx'}: out.extend(extract_js_semantics(text,rel,digest))
    if suffix=='.json': out.extend(extract_json_schema_semantics(text,rel,digest))
    return out
