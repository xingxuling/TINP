"""OPP Bridge Compiler public surface（OPP 桥编译器公开接口）。"""
from .scanner import scan_repository
from .compiler import compile_bridge, write_bridge_bundle
from .verifier import verify_repository_semantics
from .compatibility import compare_ports
from .synthesize import synthesize_bridge
from .transform import apply_transform, validate_operations, TransformError
from .semantic_model import SemanticPort, SemanticInterface, SemanticReport, CompatibilityResult
from .planner import interface_input_port, plan_repository_connection

__all__=[
    "scan_repository","compile_bridge","write_bridge_bundle","verify_repository_semantics",
    "compare_ports","synthesize_bridge","apply_transform","validate_operations","TransformError",
    "SemanticPort","SemanticInterface","SemanticReport","CompatibilityResult",
    "interface_input_port","plan_repository_connection",
]
