"""OPP bounded runtime public surface（OPP 有界运行时公开接口）。"""
from .model import InvocationSpec
from .invoke import run_invocation, InvocationError
from .interop import run_interop, InteropError

__all__ = ["InvocationSpec", "run_invocation", "InvocationError", "run_interop", "InteropError"]
