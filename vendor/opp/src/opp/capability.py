"""RCP capability-contract negotiation（现实能力契约协商）。"""
from __future__ import annotations

from typing import Any, Mapping

from .integrity import content_root
from .validation import validate_envelope


def _payload(envelope: Mapping[str, Any], side: str) -> Mapping[str, Any]:
    """Validate and extract one RCP capability declaration."""

    if not isinstance(envelope, Mapping):
        raise ValueError(f"{side} capability must be an object")
    issues = validate_envelope(dict(envelope))
    if issues:
        details = "; ".join(f"{issue.code}:{issue.path}" for issue in issues)
        raise ValueError(f"{side} capability envelope invalid: {details}")
    if envelope["protocol"] != "opp.rcp.v0.1" or envelope["kind"] != "capability":
        raise ValueError(f"{side} capability must use opp.rcp.v0.1")
    payload = envelope["payload"]
    if not isinstance(payload, Mapping):
        raise ValueError(f"{side} capability payload must be an object")
    return payload


def _schema_root(value: Any) -> str:
    """Hash a schema value canonically, including an explicit null schema."""

    return content_root(value)


def negotiate_capability(local: Mapping[str, Any], remote: Mapping[str, Any]) -> dict[str, Any]:
    """Negotiate two RCP declarations with exact contract identity.

    CHP decides whether two participants can speak and exposes a coarse
    capability intersection.  This RCP operation is the OPP-owned next step:
    it checks that two declarations for the same capability carry the same
    input and output schemas.  It never grants authority or probes a provider.
    """

    local_payload = _payload(local, "local")
    remote_payload = _payload(remote, "remote")
    local_id = str(local_payload["capabilityId"])
    remote_id = str(remote_payload["capabilityId"])
    local_input = _schema_root(local_payload.get("inputSchema"))
    remote_input = _schema_root(remote_payload.get("inputSchema"))
    local_output = _schema_root(local_payload.get("outputSchema"))
    remote_output = _schema_root(remote_payload.get("outputSchema"))

    reasons: list[str] = []
    if local_id != remote_id:
        reasons.append("CAPABILITY_ID_MISMATCH")
    if local_input != remote_input:
        reasons.append("INPUT_SCHEMA_MISMATCH")
    if local_output != remote_output:
        reasons.append("OUTPUT_SCHEMA_MISMATCH")

    body = {
        "format": "taowind.opp.capability-agreement.v0.1",
        "version": "0.1.0-candidate.1",
        "participants": [local["issuer"]["id"], remote["issuer"]["id"]],
        "capabilityId": local_id if local_id == remote_id else None,
        "capabilityIds": [local_id, remote_id],
        "status": "accepted" if not reasons else "rejected",
        "contractRoots": {
            "local": {"inputSchemaRoot": local_input, "outputSchemaRoot": local_output},
            "remote": {"inputSchemaRoot": remote_input, "outputSchemaRoot": remote_output},
        },
        "authorityRequired": sorted(set(local_payload["authorityRequired"]) | set(remote_payload["authorityRequired"])),
        "authorityGranted": False,
        "reasons": reasons,
        "boundary": "RCP contract agreement proves exact declaration compatibility only; it does not authenticate identity, probe a provider, grant authority or prove quality.",
    }
    return {**body, "contentRoot": content_root(body)}


__all__ = ["negotiate_capability"]
