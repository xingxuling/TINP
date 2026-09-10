"""Semantic bridge IR（语义桥中间表示）。

The IR is intentionally a bounded JSON-Schema-like subset. Unknown information stays
unknown; discovery never grants authority or runtime support.
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Any

Shape = dict[str, Any]

@dataclass(frozen=True)
class SemanticPort:
    port_id: str
    name: str
    direction: str  # input | output
    shape: Shape
    modality: str = "data"
    semantic_tags: tuple[str, ...] = ()
    required: bool = True
    default: Any = None
    confidence: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["semantic_tags"] = list(self.semantic_tags)
        return d

@dataclass(frozen=True)
class SemanticInterface:
    interface_id: str
    name: str
    interface_kind: str  # callable | schema | endpoint | unknown
    operation: str
    inputs: tuple[SemanticPort, ...]
    outputs: tuple[SemanticPort, ...]
    side_effects: tuple[str, ...] = ()
    authority_required: tuple[str, ...] = ()
    source_path: str = ""
    source_digest: str = ""
    source_line: int | None = None
    extractor: str = "unknown"
    confidence: float = 0.0
    evidence: tuple[str, ...] = ()
    runtime_support: str = "unverified"

    def to_dict(self) -> dict[str, Any]:
        return {
            "interfaceId": self.interface_id,
            "name": self.name,
            "interfaceKind": self.interface_kind,
            "operation": self.operation,
            "inputs": [p.to_dict() for p in self.inputs],
            "outputs": [p.to_dict() for p in self.outputs],
            "sideEffects": list(self.side_effects),
            "authorityRequired": list(self.authority_required),
            "source": {"path": self.source_path, "digest": self.source_digest, "line": self.source_line, "extractor": self.extractor},
            "confidence": round(float(self.confidence), 4),
            "evidence": list(self.evidence),
            "runtimeSupport": self.runtime_support,
        }

@dataclass
class SemanticReport:
    source_id: str
    root: str
    profile: str
    interfaces: list[SemanticInterface] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    primitive_finding_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "format": "taowind.opp.semantic-verification.v0.1",
            "sourceId": self.source_id,
            "root": self.root,
            "profile": self.profile,
            "primitiveFindingCount": self.primitive_finding_count,
            "interfaceCount": len(self.interfaces),
            "interfaces": [i.to_dict() for i in self.interfaces],
            "warnings": list(self.warnings),
            "authority": {"sourceAuthorityInherited": False, "canonicalPromotionPerformed": False},
            "boundary": "Static semantic inference only. Signatures and schemas support bounded interface-shape claims, not runtime interoperability, business meaning, truth, or authority / 仅静态语义推断；签名与模式只支持有限的接口形状主张，不证明运行互操作、业务含义、真实性或权限。",
        }

@dataclass(frozen=True)
class CompatibilityResult:
    classification: str  # exact | structural | lossy | incompatible | unknown
    producer_port: str
    consumer_port: str
    type_compatible: bool | None
    semantic_compatible: bool | None
    confidence: float
    reasons: tuple[str, ...] = ()
    operations: tuple[dict[str, Any], ...] = ()
    missing_information: tuple[str, ...] = ()
    authority_gap: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "format": "taowind.opp.bridge-compatibility.v0.1",
            "classification": self.classification,
            "producerPort": self.producer_port,
            "consumerPort": self.consumer_port,
            "typeCompatible": self.type_compatible,
            "semanticCompatible": self.semantic_compatible,
            "confidence": round(float(self.confidence), 4),
            "reasons": list(self.reasons),
            "operations": list(self.operations),
            "missingInformation": list(self.missing_information),
            "authorityGap": list(self.authority_gap),
            "boundary": "Compatibility is inferred from declared/static shapes and tags. It is not proof that either native runtime actually interoperates / 兼容性来自声明或静态形状与语义标签推断，不证明原生运行时实际互操作。",
        }

def port_from_dict(data: dict[str, Any]) -> SemanticPort:
    """Parse public JSON form into SemanticPort（把公开 JSON 形式解析成语义端口）。"""
    return SemanticPort(
        str(data.get('port_id') or data.get('portId') or data.get('id') or data.get('name') or 'port'),
        str(data.get('name') or data.get('port_id') or data.get('portId') or 'port'),
        str(data.get('direction') or 'input'),
        dict(data.get('shape') or {}),
        str(data.get('modality') or 'data'),
        tuple(str(x) for x in (data.get('semantic_tags') or data.get('semanticTags') or [])),
        bool(data.get('required',True)),
        data.get('default'),
        float(data.get('confidence',0.5)),
    )
