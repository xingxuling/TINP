"""UTF-8 process adapter; all protocol agreement algorithms remain upstream OPP."""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "vendor/opp/src"))

from opp.handshake import negotiate_handshake
from opp.capability import negotiate_capability
from opp.integrity import seal_envelope


def envelope(protocol, kind, issuer, payload):
    return seal_envelope({
        "format": "taowind.opp.reality-envelope.v0.1", "protocol": protocol,
        "version": "0.1.0-candidate.1", "kind": kind,
        "id": f"next-internet:{protocol}:{issuer}", "status": "candidate",
        "issuedAt": "1970-01-01T00:00:00Z", "issuer": {"id": issuer, "type": "runtime"},
        "payload": payload, "constraints": ["Declaration only; no authentication or authority grant"],
        "evidenceRefs": [], "extensions": {},
    })


def offer(hello):
    # Adapter-owned declaration: this process implements CHP/RCP/REP alongside TINP.
    # Unlike legacy TINP projection, no schema-invalid projectionRoot is emitted.
    return envelope("opp.chp.v0.1", "protocol", hello["nodeId"], {
        "phase": "offer", "identity": {"id": hello["nodeId"], "civilizationType": "runtime"},
        "supportedProtocols": list(dict.fromkeys(hello["protocols"] + ["opp.chp.v0.1", "opp.rcp.v0.1", "opp.rep.v0.1"])),
        "capabilities": hello["capabilities"], "authorityScopes": hello["authorityScopes"],
        "evidencePolicy": {"minimumConfidence": 0, "acceptDerivedEvidence": False,
                           "requiredProtocols": ["opp.chp.v0.1", "opp.rcp.v0.1", "opp.rep.v0.1"]},
        "extensions": {"subjectId": hello["subjectId"], "tinpHelloRoot": hello["helloRoot"]},
    })


def capability(hello, spec):
    return envelope("opp.rcp.v0.1", "capability", hello["nodeId"], {
        "capabilityId": spec["capabilityId"], "name": spec["capabilityId"],
        "domain": "next-internet", "operation": spec["capabilityId"],
        "inputModalities": ["json"], "outputModalities": ["json"],
        "inputSchema": spec["inputSchema"], "outputSchema": spec["outputSchema"],
        "determinism": "unknown", "statefulness": "unknown",
        "authorityRequired": spec["authorityRequired"], "sideEffects": [],
        "reversibility": "unknown", "availability": "candidate-only", "evidence": [],
        "claimBoundary": "Exact declaration compatibility only; provider behavior remains unverified",
    })


def main():
    request = json.loads(sys.stdin.buffer.read(1_048_577).decode("utf-8"))
    local, remote = request["localHello"], request["remoteHello"]
    lc, rc = request["localCapability"], request["remoteCapability"]
    # Version selection is a caller profile precondition, not a second RCP negotiator.
    if not isinstance(lc.get("version"), str) or lc["version"] != rc.get("version"):
        raise ValueError("OPP_PROFILE_VERSION_MISMATCH")
    result = {
        "handshake": negotiate_handshake(offer(local), offer(remote)),
        "capability": negotiate_capability(capability(local, lc), capability(remote, rc)),
        "owner": "OPP", "upstreamCommit": "f7b76582a720d9d18af5153affa0fc2d78bc0410",
    }
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False, allow_nan=False).encode("utf-8"))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        sys.stderr.buffer.write((type(exc).__name__ + ": " + str(exc)).encode("utf-8"))
        raise SystemExit(1)
