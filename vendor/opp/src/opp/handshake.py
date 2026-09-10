"""CHP Civilization Handshake（文明握手）参考协商器。"""
from __future__ import annotations
from datetime import datetime, timezone
from .integrity import seal_envelope
from .validation import validate_envelope


def _offer_payload(envelope: dict) -> dict:
    issues = validate_envelope(envelope)
    if issues:
        details = "; ".join(f"{i.code}:{i.path}" for i in issues)
        raise ValueError(f"握手 offer 无效 / invalid handshake offer: {details}")
    if envelope["protocol"] != "opp.chp.v0.1" or envelope["payload"].get("phase") != "offer":
        raise ValueError("需要 CHP offer / CHP offer required")
    return envelope["payload"]


def negotiate_handshake(local: dict, remote: dict) -> dict:
    """确定性求交；不会授予任何未在双方 offer 中同时出现的权限。"""
    lp, rp = _offer_payload(local), _offer_payload(remote)
    local_id, remote_id = lp["identity"]["id"], rp["identity"]["id"]
    protocols = sorted(set(lp["supportedProtocols"]) & set(rp["supportedProtocols"]))
    capabilities = sorted(set(lp["capabilities"]) & set(rp["capabilities"]))
    scopes = sorted(set(lp["authorityScopes"]) & set(rp["authorityScopes"]))

    required = set(lp["evidencePolicy"].get("requiredProtocols", [])) | set(rp["evidencePolicy"].get("requiredProtocols", []))
    missing_required = sorted(required - set(protocols))
    accepted = bool(protocols) and not missing_required
    min_conf = max(float(lp["evidencePolicy"]["minimumConfidence"]), float(rp["evidencePolicy"]["minimumConfidence"]))
    accept_derived = bool(lp["evidencePolicy"]["acceptDerivedEvidence"] and rp["evidencePolicy"]["acceptDerivedEvidence"])
    reasons = []
    if not protocols:
        reasons.append("没有共同协议 / no common protocol")
    if missing_required:
        reasons.append("缺少双方要求的协议 / missing required protocols: " + ",".join(missing_required))

    result = {
        "format": "taowind.opp.reality-envelope.v0.1",
        "protocol": "opp.chp.v0.1",
        "version": "0.1.0-candidate.1",
        "kind": "protocol",
        "id": f"chp:{local_id}:{remote_id}",
        "status": "candidate",
        "issuedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "issuer": {"id": local_id, "type": "runtime", "displayName": lp["identity"].get("displayName", local_id)},
        "payload": {
            "phase": "agreement" if accepted else "reject",
            "participants": [local_id, remote_id],
            "status": "accepted" if accepted else "rejected",
            "agreedProtocols": protocols,
            "sharedCapabilities": capabilities,
            "authorityScopes": scopes,
            "evidencePolicy": {"minimumConfidence": min_conf, "acceptDerivedEvidence": accept_derived},
            "reasons": reasons,
        },
        "constraints": ["握手不得创建 offer 之外的新权限 / handshake must not create authority absent from offers"],
        "evidenceRefs": [],
        "extensions": {},
    }
    return seal_envelope(result)
