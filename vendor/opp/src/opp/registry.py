"""Registry（协议注册表）读取与协议发现。"""
from __future__ import annotations
import json
from functools import lru_cache
from importlib.resources import files
from pathlib import Path


def repository_root() -> Path:
    """源码树根目录；主要供示例与测试定位使用。"""
    return Path(__file__).resolve().parents[2]


def read_resource_text(relative: str) -> str:
    """优先读取源码树资源；安装包环境退回 package resources（包资源）。"""
    source_path = repository_root() / relative
    if source_path.exists():
        return source_path.read_text(encoding="utf-8")
    resource = files("opp").joinpath("resources", *Path(relative).parts)
    return resource.read_text(encoding="utf-8")


def read_json_resource(relative: str) -> dict:
    return json.loads(read_resource_text(relative))


@lru_cache(maxsize=1)
def load_registry() -> dict:
    return read_json_resource("registry/protocols.json")


def protocol_entry(protocol_id: str) -> dict | None:
    for entry in load_registry()["protocols"]:
        if entry["id"] == protocol_id:
            return entry
    return None
