"""Native invocation models（原生调用模型）。"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class InvocationSpec:
    spec_id: str
    adapter_kind: str
    source_root: str
    entrypoint: str
    calling_convention: str = "kwargs"
    timeout_ms: int = 3000
    max_output_bytes: int = 262144
    cwd_policy: str = "ephemeral"
    environment_policy: str = "sanitized"
    authority_required: tuple[str, ...] = ()
    status: str = "candidate"

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "InvocationSpec":
        if not isinstance(data, dict):
            raise ValueError("INVOCATION_SPEC_OBJECT_REQUIRED")
        if data.get("format") != "taowind.opp.invocation-spec.v0.1":
            raise ValueError("INVOCATION_SPEC_FORMAT_INVALID")
        spec_id = str(data.get("specId") or "").strip()
        if not spec_id:
            raise ValueError("INVOCATION_SPEC_ID_REQUIRED")
        source_root = str(data.get("sourceRoot") or "").strip()
        entrypoint = str(data.get("entrypoint") or "").strip()
        if not source_root:
            raise ValueError("INVOCATION_SOURCE_ROOT_REQUIRED")
        if not entrypoint:
            raise ValueError("INVOCATION_ENTRYPOINT_REQUIRED")
        return cls(
            spec_id=spec_id,
            adapter_kind=str(data.get("adapterKind") or ""),
            source_root=source_root,
            entrypoint=entrypoint,
            calling_convention=str(data.get("callingConvention") or "kwargs"),
            timeout_ms=int(data.get("timeoutMs", 3000)),
            max_output_bytes=int(data.get("maxOutputBytes", 262144)),
            cwd_policy=str(data.get("cwdPolicy") or "ephemeral"),
            environment_policy=str(data.get("environmentPolicy") or "sanitized"),
            authority_required=tuple(str(x) for x in (data.get("authorityRequired") or [])),
            status=str(data.get("status") or "candidate"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "format": "taowind.opp.invocation-spec.v0.1",
            "version": "0.3.0-candidate.1",
            "specId": self.spec_id,
            "adapterKind": self.adapter_kind,
            "sourceRoot": self.source_root,
            "entrypoint": self.entrypoint,
            "callingConvention": self.calling_convention,
            "timeoutMs": self.timeout_ms,
            "maxOutputBytes": self.max_output_bytes,
            "cwdPolicy": self.cwd_policy,
            "environmentPolicy": self.environment_policy,
            "authorityRequired": list(self.authority_required),
            "status": self.status,
        }
