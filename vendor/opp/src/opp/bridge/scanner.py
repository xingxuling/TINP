"""Bounded, non-executing repository scanner（有界、非执行式仓库扫描器）。"""
from __future__ import annotations
import hashlib, os
from pathlib import Path
from .extractors import extract_candidates
from .model import PrimitiveFinding, ScanReport, SourceRef, PRIMITIVE_KINDS
from .profiles import detect_profile, get_profile, BridgeProfile

TEXT_SUFFIXES={'.json','.py','.js','.mjs','.cjs','.ts','.tsx','.jsx','.rcl','.md','.txt','.toml','.yaml','.yml'}
SKIP_DIRS={'.git','node_modules','build','dist','.venv','venv','__pycache__','.pytest_cache','.mypy_cache','.ruff_cache','.zig-cache','zig-cache'}

def _sha(data: bytes)->str: return hashlib.sha256(data).hexdigest()
def _fid(profile: str, rel: str, kind: str, native_id: str, symbol: str|None)->str:
    raw=f"{profile}\0{rel}\0{kind}\0{native_id}\0{symbol or ''}".encode()
    return f"finding-{hashlib.sha256(raw).hexdigest()[:24]}"

def scan_repository(root: str|Path, *, source_id: str|None=None, profile: str|BridgeProfile|None='auto',
                    max_files: int=5000, max_file_bytes: int=1_000_000, max_total_bytes: int=50_000_000) -> ScanReport:
    base=Path(root).resolve()
    if not base.is_dir(): raise ValueError(f"BRIDGE_SOURCE_DIRECTORY_REQUIRED:{base}")
    prof = profile if isinstance(profile,BridgeProfile) else (detect_profile(base) if profile in (None,'auto') else get_profile(profile))
    sid=source_id or base.name
    findings=[]; warnings=[]; files_seen=files_scanned=bytes_scanned=0; truncated=False
    for dirpath,dirnames,filenames in os.walk(base):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and not d.startswith('.dwac-cache'))
        for name in sorted(filenames):
            files_seen+=1
            if files_scanned>=max_files or bytes_scanned>=max_total_bytes:
                truncated=True; break
            path=Path(dirpath)/name
            if path.is_symlink():
                warnings.append(f"SYMLINK_SKIPPED:{path.relative_to(base).as_posix()}"); continue
            if path.suffix.lower() not in TEXT_SUFFIXES: continue
            try: size=path.stat().st_size
            except OSError: continue
            if size>max_file_bytes:
                warnings.append(f"FILE_SKIPPED_TOO_LARGE:{path.relative_to(base).as_posix()}:{size}"); continue
            if bytes_scanned + size > max_total_bytes:
                truncated=True; break
            try: data=path.read_bytes()
            except OSError as exc:
                warnings.append(f"FILE_READ_FAILED:{path.relative_to(base).as_posix()}:{type(exc).__name__}"); continue
            bytes_scanned+=len(data); files_scanned+=1
            text=data.decode('utf-8',errors='replace')
            rel=path.relative_to(base).as_posix(); digest=_sha(data)
            for c in extract_candidates(text,path):
                kind=c['kind'] if c['kind'] in PRIMITIVE_KINDS else 'bridge'
                native=str(c['native_id']).strip()
                if not native: continue
                profile_bonus=0.03 if any(native.lower().startswith(p.lower()) for p in prof.id_prefixes) else 0
                conf=min(1.0,float(c.get('confidence',0.5))+profile_bonus)
                src=SourceRef(rel,digest,len(data),c.get('line'),c.get('symbol'),c.get('evidence','unknown'))
                findings.append(PrimitiveFinding(_fid(prof.profile_id,rel,kind,native,c.get('symbol')),kind,native,str(c.get('name') or native),conf,prof.profile_id,src,(str(c.get('evidence','unknown')),),(),"lexically-discovered-candidate"))
        if truncated: break
    # cross-file de-dup: retain strongest, then deterministic ordering
    best={}
    for f in findings:
        key=(f.kind,f.native_id,f.source.path)
        if key not in best or f.confidence>best[key].confidence: best[key]=f
    ordered=sorted(best.values(), key=lambda f:(f.kind,f.native_id,f.source.path,f.source.line or 0,f.finding_id))
    return ScanReport(sid,str(base),prof.profile_id,files_seen,files_scanned,bytes_scanned,truncated,ordered,warnings)
