"""First-party profile hints（第一方适配提示）。核心扫描逻辑不依赖仓库名。"""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class BridgeProfile:
    profile_id: str
    display_name: str
    id_prefixes: tuple[str, ...] = ()
    path_markers: tuple[str, ...] = ()
    filename_markers: tuple[str, ...] = ()
    default_identity_type: str = "runtime"

GENERIC = BridgeProfile("generic", "Generic Repository / 通用仓库")
RCL = BridgeProfile("rcl", "RCL / Reality Compiler Language（现实编译语言）",
    id_prefixes=("rcl.","taowind.rcl"), path_markers=("selfhost","native"),
    filename_markers=("foundation-contract","relational-transaction-protocol","VERSION-CONTRACT"))
RNCS = BridgeProfile("rncs", "RNCS / Reality Neural Computing System（现实神经计算系统）",
    id_prefixes=("rncs.","rcl."), path_markers=("packages/languages/reality-computation-language",),
    filename_markers=("RNCS","reality-computation-language"), default_identity_type="federation")
DWAC = BridgeProfile("dwac", "DWAC / Distributed Whole-Artifact Compiler（分布式全工件编译器）",
    id_prefixes=("dwac.","taowind.dwac"), path_markers=("structural_generation","organs"),
    filename_markers=("DWAC_USCE_FEDERATION_CONTRACT","DWAC_WORKER_PROTOCOL","WHOLE_ARTIFACT"), default_identity_type="runtime")
PROFILES={p.profile_id:p for p in (GENERIC,RCL,RNCS,DWAC)}

def get_profile(profile_id: str | None) -> BridgeProfile:
    if profile_id in (None,"auto"): return GENERIC
    if profile_id not in PROFILES: raise ValueError(f"UNKNOWN_BRIDGE_PROFILE:{profile_id}")
    return PROFILES[profile_id]

def detect_profile(root: Path) -> BridgeProfile:
    root=Path(root)
    sample=[]
    try:
        for p in root.rglob('*'):
            if len(sample)>=500: break
            rel=p.relative_to(root).as_posix()
            sample.append(rel)
    except OSError:
        pass
    joined='\n'.join(sample).lower()
    scores={"rcl":0,"rncs":0,"dwac":0}
    for pid,p in (("rcl",RCL),("rncs",RNCS),("dwac",DWAC)):
        scores[pid]+=sum(3 for x in p.path_markers if x.lower() in joined)
        scores[pid]+=sum(2 for x in p.filename_markers if x.lower() in joined)
    name=root.name.lower()
    if "dwac" in name: scores["dwac"]+=5
    if "rncs" in name: scores["rncs"]+=5
    if name in {"rcl","rcl-latest","rcl-smoke"} or name.startswith("rcl-"): scores["rcl"]+=5
    best=max(scores, key=scores.get)
    return PROFILES[best] if scores[best]>0 else GENERIC
