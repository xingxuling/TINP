"""Integrity（完整性）工具：提供规范化 JSON 与 SHA-256 内容根。"""
from __future__ import annotations
import copy, hashlib, json
from typing import Any, Mapping


def canonical_json_bytes(value: Any) -> bytes:
    """生成 deterministic canonical JSON（确定性规范 JSON）字节。"""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def content_root(value: Any) -> str:
    """计算 SHA-256 content root（内容根）。"""
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def unsigned_envelope(envelope: Mapping[str, Any]) -> dict[str, Any]:
    """移除 integrity（完整性字段），得到被哈希的规范内容。"""
    value = copy.deepcopy(dict(envelope))
    value.pop("integrity", None)
    return value


def seal_envelope(envelope: Mapping[str, Any]) -> dict[str, Any]:
    """附加 SHA-256 内容根；这不是数字签名或身份认证。"""
    value = unsigned_envelope(envelope)
    value["integrity"] = {"algorithm": "sha256", "contentRoot": content_root(value)}
    return value


def verify_envelope_root(envelope: Mapping[str, Any]) -> bool:
    integrity = envelope.get("integrity")
    if not integrity:
        return True
    if integrity.get("algorithm") != "sha256":
        return False
    return integrity.get("contentRoot") == content_root(unsigned_envelope(envelope))
