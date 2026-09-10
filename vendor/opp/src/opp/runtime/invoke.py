"""Explicit bounded native invocation（显式有界原生调用）。"""
from __future__ import annotations
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any
from ..integrity import content_root
from .model import InvocationSpec

ENTRY_RE = re.compile(r"^([^:]+\.py):([A-Za-z_][A-Za-z0-9_]*)$")
SUPPORTED_ADAPTERS = {"python-function"}
SUPPORTED_CALLING = {"kwargs", "single"}

class InvocationError(RuntimeError):
    pass


def _contained_python_target(spec: InvocationSpec) -> tuple[Path, str]:
    if spec.adapter_kind not in SUPPORTED_ADAPTERS:
        raise InvocationError(f"ADAPTER_UNSUPPORTED:{spec.adapter_kind}")
    m = ENTRY_RE.fullmatch(spec.entrypoint)
    if not m:
        raise InvocationError("ENTRYPOINT_FORMAT_INVALID")
    root = Path(spec.source_root).expanduser().resolve()
    if not root.is_dir():
        raise InvocationError("SOURCE_ROOT_NOT_DIRECTORY")
    rel, fn = m.group(1), m.group(2)
    raw = root / rel
    # Reject symlinks in any existing entrypoint path component.
    cur = root
    for part in Path(rel).parts:
        cur = cur / part
        if cur.is_symlink():
            raise InvocationError("ENTRYPOINT_SYMLINK_REJECTED")
    target = raw.resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise InvocationError("ENTRYPOINT_PATH_ESCAPE") from exc
    if not target.is_file() or target.suffix.lower() != ".py":
        raise InvocationError("ENTRYPOINT_PYTHON_FILE_REQUIRED")
    return target, fn


def _sanitized_env() -> dict[str, str]:
    env = {
        "PYTHONIOENCODING": "utf-8",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONHASHSEED": "0",
    }
    for key in ("LANG", "LC_ALL", "TZ"):
        value = os.environ.get(key)
        if value:
            env[key] = value
    return env


def _receipt_core(spec: InvocationSpec, input_root: str, *, status: str, exit_code: int | None, timed_out: bool, result_root: str | None, stdout_bytes: int, stderr_bytes: int, target_stdout: str, target_stderr: str, error: str | None) -> dict[str, Any]:
    return {
        "format": "taowind.opp.invocation-receipt.v0.1",
        "version": "0.3.0-candidate.1",
        "specId": spec.spec_id,
        "adapterKind": spec.adapter_kind,
        "entrypoint": spec.entrypoint,
        "status": status,
        "requestRoot": content_root({"spec": spec.to_dict(), "inputRoot": input_root}),
        "resultRoot": result_root,
        "exitCode": exit_code,
        "timedOut": timed_out,
        "stdoutBytes": stdout_bytes,
        "stderrBytes": stderr_bytes,
        "targetStdout": target_stdout,
        "targetStderr": target_stderr,
        "error": error,
        "authority": {"required": list(spec.authority_required), "inheritedFromEnvironment": False, "promotionPerformed": False},
        "executionBoundary": {
            "explicitConsentRequired": True,
            "shellUsed": False,
            "environmentPolicy": spec.environment_policy,
            "cwdPolicy": spec.cwd_policy,
            "strongOsSandboxClaimed": False,
        },
        "boundary": "PASS proves only this explicit invocation completed under the OPP bounded child-process policy. It does not prove the target is safe or strongly sandboxed / PASS 只证明本次显式调用在 OPP 有界子进程策略下完成，不证明目标代码安全或具备强沙箱隔离。",
    }


def run_invocation(spec_or_dict: InvocationSpec | dict[str, Any], payload: Any, *, allow_execution: bool = False) -> dict[str, Any]:
    try:
        spec = spec_or_dict if isinstance(spec_or_dict, InvocationSpec) else InvocationSpec.from_dict(spec_or_dict)
    except (TypeError, ValueError) as exc:
        raise InvocationError(str(exc)) from exc
    if not allow_execution:
        raise InvocationError("EXECUTION_CONSENT_REQUIRED")
    if spec.status != "candidate":
        raise InvocationError("INVOCATION_SPEC_STATUS_UNSUPPORTED")
    if spec.calling_convention not in SUPPORTED_CALLING:
        raise InvocationError("CALLING_CONVENTION_UNSUPPORTED")
    if spec.timeout_ms < 1 or spec.timeout_ms > 120_000:
        raise InvocationError("TIMEOUT_OUT_OF_RANGE")
    if spec.max_output_bytes < 1024 or spec.max_output_bytes > 16_777_216:
        raise InvocationError("OUTPUT_LIMIT_OUT_OF_RANGE")
    target, function_name = _contained_python_target(spec)
    if spec.cwd_policy != "ephemeral" or spec.environment_policy != "sanitized":
        raise InvocationError("INVOCATION_POLICY_UNSUPPORTED")
    runner = Path(__file__).with_name("child_python.py").resolve()
    input_bytes = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    input_root = content_root(payload)
    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="opp-invoke-") as td:
        try:
            proc = subprocess.run(
                [sys.executable, "-I", str(runner), str(target), function_name, spec.calling_convention, str(spec.max_output_bytes)],
                input=input_bytes,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=td,
                env=_sanitized_env(),
                timeout=spec.timeout_ms / 1000,
                check=False,
            )
            stdout, stderr = proc.stdout, proc.stderr
            if len(stdout) > spec.max_output_bytes or len(stderr) > spec.max_output_bytes:
                core = _receipt_core(spec, input_root, status="FAIL", exit_code=proc.returncode, timed_out=False, result_root=None, stdout_bytes=len(stdout), stderr_bytes=len(stderr), target_stdout="", target_stderr="", error="OUTPUT_LIMIT_EXCEEDED")
                return {"receipt": {**core, "durationMs": round((time.perf_counter()-started)*1000, 3), "receiptRoot": content_root(core)}, "result": None}
            try:
                envelope = json.loads(stdout.decode("utf-8"))
            except Exception:
                envelope = {"ok": False, "error": "CHILD_OUTPUT_JSON_INVALID", "targetStdout": "", "targetStderr": stderr.decode("utf-8", errors="replace")}
            ok = bool(envelope.get("ok")) and proc.returncode == 0
            result = envelope.get("result") if ok else None
            result_root = content_root(result) if ok else None
            core = _receipt_core(
                spec, input_root,
                status="PASS" if ok else "FAIL",
                exit_code=proc.returncode,
                timed_out=False,
                result_root=result_root,
                stdout_bytes=len(stdout),
                stderr_bytes=len(stderr),
                target_stdout=str(envelope.get("targetStdout") or "")[:spec.max_output_bytes],
                target_stderr=str(envelope.get("targetStderr") or "")[:spec.max_output_bytes],
                error=None if ok else str(envelope.get("error") or "INVOCATION_FAILED"),
            )
            return {"receipt": {**core, "durationMs": round((time.perf_counter()-started)*1000, 3), "receiptRoot": content_root(core)}, "result": result}
        except subprocess.TimeoutExpired as exc:
            stdout = exc.stdout or b""; stderr = exc.stderr or b""
            core = _receipt_core(spec, input_root, status="FAIL", exit_code=None, timed_out=True, result_root=None, stdout_bytes=len(stdout), stderr_bytes=len(stderr), target_stdout="", target_stderr="", error="INVOCATION_TIMEOUT")
            return {"receipt": {**core, "durationMs": round((time.perf_counter()-started)*1000, 3), "receiptRoot": content_root(core)}, "result": None}
