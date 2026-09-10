"""Validation（验证）运行时：验证现实信封、协议负载与完整性根。"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any
from jsonschema import Draft202012Validator, FormatChecker
from .integrity import verify_envelope_root
from .registry import load_registry, protocol_entry, read_json_resource


@dataclass(frozen=True)
class ValidationIssue:
    code: str
    message: str
    path: str = ""


def _schema_issues(instance: Any, schema: dict, prefix: str) -> list[ValidationIssue]:
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    issues: list[ValidationIssue] = []
    for error in sorted(validator.iter_errors(instance), key=lambda e: list(e.path)):
        path = ".".join(str(x) for x in error.absolute_path)
        issues.append(ValidationIssue("SCHEMA_INVALID", error.message, f"{prefix}{('.' + path) if path else ''}"))
    return issues


def validate_envelope(envelope: dict) -> list[ValidationIssue]:
    """返回问题列表；空列表代表结构候选验证通过，不代表现实主张为真。"""
    base_schema = read_json_resource(load_registry()["baseEnvelopeSchema"])
    issues = _schema_issues(envelope, base_schema, "envelope")
    if issues:
        return issues

    entry = protocol_entry(envelope["protocol"])
    if entry is None:
        return [ValidationIssue("PROTOCOL_UNKNOWN", f"未知协议 / unknown protocol: {envelope['protocol']}", "envelope.protocol")]
    if envelope["kind"] != entry["kind"]:
        issues.append(ValidationIssue("KIND_MISMATCH", f"原语类型应为 {entry['kind']} / primitive kind mismatch", "envelope.kind"))

    payload_schema = read_json_resource(entry["payloadSchema"])
    issues.extend(_schema_issues(envelope["payload"], payload_schema, "payload"))
    if not verify_envelope_root(envelope):
        issues.append(ValidationIssue("INTEGRITY_ROOT_MISMATCH", "SHA-256 内容根不匹配 / content root mismatch", "envelope.integrity"))
    return issues
