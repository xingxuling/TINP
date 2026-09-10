"""Bridge Compiler IR（桥编译器中间表示）。"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Any

PRIMITIVE_KINDS = ("protocol","contract","interface","schema","capability","evidence","receipt","ledger","bridge")

@dataclass(frozen=True)
class SourceRef:
    path: str
    digest: str
    size: int
    line: int | None = None
    symbol: str | None = None
    extractor: str = "unknown"
    def to_dict(self) -> dict[str, Any]: return asdict(self)

@dataclass(frozen=True)
class PrimitiveFinding:
    finding_id: str
    kind: str
    native_id: str
    name: str
    confidence: float
    profile: str
    source: SourceRef
    evidence: tuple[str, ...] = ()
    authority_scopes: tuple[str, ...] = ()
    semantics: str = "lexically-discovered-candidate"
    def to_dict(self) -> dict[str, Any]:
        d=asdict(self); d["source"]=self.source.to_dict(); d["evidence"]=list(self.evidence); d["authority_scopes"]=list(self.authority_scopes); return d

@dataclass
class ScanReport:
    source_id: str
    root: str
    profile: str
    files_seen: int
    files_scanned: int
    bytes_scanned: int
    truncated: bool
    findings: list[PrimitiveFinding] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    def to_dict(self) -> dict[str, Any]:
        return {"format":"taowind.opp.bridge-scan.v0.1","sourceId":self.source_id,"root":self.root,
                "profile":self.profile,"filesSeen":self.files_seen,"filesScanned":self.files_scanned,
                "bytesScanned":self.bytes_scanned,"truncated":self.truncated,
                "findings":[f.to_dict() for f in self.findings],"warnings":list(self.warnings),
                "boundary":"Static lexical discovery only; no discovered source was executed / 仅静态词法发现，不执行被扫描源码。"}
