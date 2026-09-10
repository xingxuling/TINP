"""Producer -> OPP Bridge -> Consumer interoperability runner（生产端→OPP桥→消费端互操作运行器）。"""
from __future__ import annotations
from typing import Any
from ..bridge.transform import apply_transform, TransformError
from ..integrity import content_root
from .invoke import run_invocation, InvocationError

class InteropError(RuntimeError):
    pass


def run_interop(run_spec: dict[str, Any], producer_input: Any, *, allow_execution: bool = False) -> dict[str, Any]:
    if not allow_execution:
        raise InteropError("EXECUTION_CONSENT_REQUIRED")
    if not isinstance(run_spec, dict) or run_spec.get("format") != "taowind.opp.interop-run.v0.1":
        raise InteropError("INTEROP_RUN_SPEC_INVALID")
    bridge = run_spec.get("bridgePlan") or {}
    if bridge.get("status") != "candidate":
        raise InteropError("BRIDGE_PLAN_NOT_EXECUTABLE_CANDIDATE")
    if bridge.get("executionModel") != "opp-declarative-json-transform":
        raise InteropError("BRIDGE_EXECUTION_MODEL_UNSUPPORTED")
    producer = run_invocation(run_spec.get("producer") or {}, producer_input, allow_execution=True)
    if producer["receipt"]["status"] != "PASS":
        return _interop_receipt(run_spec, producer_input, producer=producer, transformed=None, consumer=None, status="FAIL", error="PRODUCER_FAILED")
    try:
        transformed = apply_transform(producer["result"], bridge.get("operations") or [])
    except TransformError as exc:
        return _interop_receipt(run_spec, producer_input, producer=producer, transformed=None, consumer=None, status="FAIL", error=f"BRIDGE_FAILED:{exc}")
    consumer = run_invocation(run_spec.get("consumer") or {}, transformed, allow_execution=True)
    status = "PASS" if consumer["receipt"]["status"] == "PASS" else "FAIL"
    return _interop_receipt(run_spec, producer_input, producer=producer, transformed=transformed, consumer=consumer, status=status, error=None if status=="PASS" else "CONSUMER_FAILED")


def _interop_receipt(run_spec: dict[str, Any], producer_input: Any, *, producer: dict | None, transformed: Any, consumer: dict | None, status: str, error: str | None) -> dict[str, Any]:
    stable = {
        "format": "taowind.opp.interop-receipt.v0.1",
        "version": "0.3.0-candidate.1",
        "runId": str(run_spec.get("runId") or "interop-run"),
        "status": status,
        "producerRequestRoot": content_root(producer_input),
        "producerReceiptRoot": producer["receipt"]["receiptRoot"] if producer else None,
        "bridgePlanRoot": (run_spec.get("bridgePlan") or {}).get("planRoot"),
        "transformedRoot": content_root(transformed) if transformed is not None else None,
        "consumerReceiptRoot": consumer["receipt"]["receiptRoot"] if consumer else None,
        "finalResultRoot": content_root(consumer["result"]) if consumer and consumer.get("result") is not None else None,
        "error": error,
        "authority": {"promotionPerformed": False, "environmentAuthorityInherited": False},
        "executionBoundary": {"explicitConsentRequired": True, "strongOsSandboxClaimed": False, "hiddenRetries": False},
        "boundary": "Interop PASS proves only this concrete producer/bridge/consumer run. It does not establish universal compatibility, target safety, or strong OS isolation / 互操作 PASS 只证明本次具体生产端/桥/消费端运行成功，不代表普遍兼容、目标安全或强操作系统隔离。",
    }
    return {
        "receipt": {**stable, "receiptRoot": content_root(stable)},
        "producer": producer,
        "transformed": transformed,
        "consumer": consumer,
        "result": consumer.get("result") if consumer else None,
    }
