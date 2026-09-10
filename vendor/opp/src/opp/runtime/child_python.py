"""OPP-owned child runner for one explicit Python function（单一显式 Python 函数子运行器）。"""
from __future__ import annotations
import contextlib
import importlib.util
import io
import json
import re
import sys
import traceback
from pathlib import Path

NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class OutputLimitExceeded(RuntimeError):
    pass


class BoundedTextIO(io.TextIOBase):
    """Bound ordinary Python text output before it can grow without limit（限制普通 Python 文本输出增长）。"""
    def __init__(self, max_bytes: int):
        self.max_bytes = max_bytes
        self._parts: list[str] = []
        self._bytes = 0

    def writable(self) -> bool:
        return True

    def write(self, text: str) -> int:
        text = str(text)
        raw = text.encode("utf-8", errors="replace")
        remaining = self.max_bytes - self._bytes
        if remaining <= 0:
            raise OutputLimitExceeded("TARGET_OUTPUT_LIMIT_EXCEEDED")
        if len(raw) > remaining:
            clipped = raw[:remaining].decode("utf-8", errors="ignore")
            if clipped:
                self._parts.append(clipped)
                self._bytes += len(clipped.encode("utf-8"))
            raise OutputLimitExceeded("TARGET_OUTPUT_LIMIT_EXCEEDED")
        self._parts.append(text)
        self._bytes += len(raw)
        return len(text)

    def getvalue(self) -> str:
        return "".join(self._parts)


def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.flush()


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if len(argv) != 4:
        _emit({"ok": False, "error": "CHILD_ARGS_INVALID"})
        return 64
    source_file, function_name, convention, output_limit_raw = argv
    if not NAME_RE.fullmatch(function_name):
        _emit({"ok": False, "error": "FUNCTION_NAME_INVALID"})
        return 64
    try:
        output_limit = int(output_limit_raw)
        if output_limit < 1024:
            raise ValueError
    except ValueError:
        _emit({"ok": False, "error": "OUTPUT_LIMIT_INVALID"})
        return 64
    try:
        payload = json.loads(sys.stdin.read())
    except Exception:
        _emit({"ok": False, "error": "INPUT_JSON_INVALID"})
        return 65

    # Reserve space for the child JSON envelope itself. Direct low-level fd writes are
    # still governed only by the parent acceptance cap; this is not claimed as strong isolation.
    capture_limit = max(256, output_limit // 4)
    target_out, target_err = BoundedTextIO(capture_limit), BoundedTextIO(capture_limit)
    try:
        path = Path(source_file)
        spec = importlib.util.spec_from_file_location("_opp_target_module", path)
        if spec is None or spec.loader is None:
            raise RuntimeError("MODULE_SPEC_UNAVAILABLE")
        module = importlib.util.module_from_spec(spec)
        with contextlib.redirect_stdout(target_out), contextlib.redirect_stderr(target_err):
            spec.loader.exec_module(module)
            fn = getattr(module, function_name, None)
            if not callable(fn):
                raise RuntimeError("FUNCTION_NOT_CALLABLE")
            if convention == "kwargs":
                if not isinstance(payload, dict):
                    raise TypeError("KWARGS_OBJECT_REQUIRED")
                result = fn(**payload)
            elif convention == "single":
                result = fn(payload)
            else:
                raise ValueError("CALLING_CONVENTION_UNSUPPORTED")
        json.dumps(result, ensure_ascii=False)
        _emit({"ok": True, "result": result, "targetStdout": target_out.getvalue(), "targetStderr": target_err.getvalue()})
        return 0
    except OutputLimitExceeded:
        _emit({
            "ok": False,
            "error": "OUTPUT_LIMIT_EXCEEDED",
            "targetStdout": target_out.getvalue(),
            "targetStderr": target_err.getvalue(),
        })
        return 73
    except Exception as exc:
        _emit({
            "ok": False,
            "error": f"{type(exc).__name__}:{exc}",
            "targetStdout": target_out.getvalue(),
            "targetStderr": target_err.getvalue(),
            "traceback": traceback.format_exc(limit=8),
        })
        return 70


if __name__ == "__main__":
    raise SystemExit(main())
