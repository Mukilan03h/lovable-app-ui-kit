"""Self-owned action tool executor.

When an approved agent action runs, it goes through this registry — our own, not
a third-party runtime. A real integration registers an executor for its tool
(e.g. a Jira client that creates an issue); the executor returns a result that
becomes the action's receipt. Until a live executor is registered for a tool, the
action runs in simulated mode and the receipt is marked ``simulated: true`` so a
not-verified-against-live action is never passed off as a real side effect.
"""

from __future__ import annotations

import hashlib
from typing import Any, Callable

# tool name -> executor(args) -> result dict
_REGISTRY: dict[str, Callable[[dict], dict]] = {}


def register_executor(tool: str, fn: Callable[[dict], dict]) -> None:
    _REGISTRY[tool.lower()] = fn


def has_live_executor(tool: str) -> bool:
    return tool.lower() in _REGISTRY


def _ref(tool: str, args: dict) -> str:
    h = hashlib.sha1(f"{tool}:{sorted(args.items())}".encode()).hexdigest()[:10]
    return f"{tool.lower()}-{h}"


def execute_action(tool: str, args: dict[str, Any]) -> dict:
    """Execute an approved action. Uses a registered live executor when present;
    otherwise returns a simulated, clearly-marked receipt result."""
    fn = _REGISTRY.get(tool.lower())
    if fn is not None:
        result = fn(args)
        result.setdefault("simulated", False)
        return result
    return {
        "ok": True,
        "simulated": True,
        "tool": tool,
        "ref": _ref(tool, args),
        "summary": args.get("summary", ""),
        "note": "No live integration is configured for this tool; action recorded in simulated mode.",
    }
