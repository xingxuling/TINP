"""Semantic verifier（语义验证器） built on static source reading only."""
from __future__ import annotations
import hashlib, os
from pathlib import Path
from .semantic_extractors import extract_semantic_interfaces
from .semantic_model import SemanticReport
from .profiles import detect_profile, get_profile, BridgeProfile
from .scanner import TEXT_SUFFIXES, SKIP_DIRS, scan_repository


def verify_repository_semantics(root: str|Path, *, source_id: str|None=None, profile: str|BridgeProfile|None='auto', max_files:int=5000, max_file_bytes:int=1_000_000, max_total_bytes:int=50_000_000) -> SemanticReport:
    base=Path(root).resolve()
    if not base.is_dir(): raise ValueError(f"SEMANTIC_SOURCE_DIRECTORY_REQUIRED:{base}")
    prof=profile if isinstance(profile,BridgeProfile) else (detect_profile(base) if profile in (None,'auto') else get_profile(profile))
    primitive=scan_repository(base,source_id=source_id,profile=prof,max_files=max_files,max_file_bytes=max_file_bytes,max_total_bytes=max_total_bytes)
    interfaces=[]; warnings=[]; files=0; total=0
    for dirpath,dirnames,filenames in os.walk(base):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and not d.startswith('.dwac-cache'))
        for name in sorted(filenames):
            if files>=max_files or total>=max_total_bytes: warnings.append("SEMANTIC_SCAN_TRUNCATED"); break
            path=Path(dirpath)/name
            if path.is_symlink(): warnings.append(f"SYMLINK_SKIPPED:{path.relative_to(base).as_posix()}"); continue
            if path.suffix.lower() not in TEXT_SUFFIXES: continue
            try: size=path.stat().st_size
            except OSError: continue
            if size>max_file_bytes or total+size>max_total_bytes: continue
            try: data=path.read_bytes()
            except OSError: continue
            files+=1; total+=len(data); rel=path.relative_to(base).as_posix(); digest=hashlib.sha256(data).hexdigest(); text=data.decode('utf-8',errors='replace')
            interfaces.extend(extract_semantic_interfaces(text,rel,digest,path.suffix))
    # exact duplicate collapse, strongest confidence wins
    best={}
    for i in interfaces:
        key=(i.interface_kind,i.operation,i.source_path,i.source_line)
        if key not in best or i.confidence>best[key].confidence: best[key]=i
    ordered=sorted(best.values(),key=lambda i:(i.source_path,i.source_line or 0,i.operation,i.interface_id))
    return SemanticReport(source_id or base.name,str(base),prof.profile_id,ordered,warnings,len(primitive.findings))
