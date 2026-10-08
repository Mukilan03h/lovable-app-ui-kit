"""Per-conversation file workspace.

Files a user attaches to a chat live here, and the code interpreter runs with this
directory as its working directory — so a file used in a session stays in context
and the AI can read, edit and create files that persist for the rest of the session.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


@dataclass
class WorkspaceFile:
    name: str
    size: int
    is_image: bool


IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"}
_SAFE = re.compile(r"[^A-Za-z0-9._-]")


def safe_name(name: str) -> str:
    """Prevent path traversal: keep the basename, strip unsafe characters."""
    base = Path(name).name
    cleaned = _SAFE.sub("_", base).lstrip(".") or "file"
    return cleaned[:128]


class Workspace:
    def __init__(self, data_dir: Path, tenant_id: str, conversation_id: str):
        self.root = Path(data_dir) / "workspaces" / tenant_id / conversation_id
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, name: str) -> Path:
        p = (self.root / safe_name(name)).resolve()
        if not str(p).startswith(str(self.root.resolve())):
            raise ValueError("path escapes workspace")
        return p

    def write(self, name: str, data: bytes) -> WorkspaceFile:
        p = self.path(name)
        p.write_bytes(data)
        return WorkspaceFile(p.name, len(data), p.suffix.lower() in IMAGE_EXT)

    def write_text(self, name: str, text: str) -> WorkspaceFile:
        return self.write(name, text.encode("utf-8"))

    def read(self, name: str) -> bytes:
        return self.path(name).read_bytes()

    def exists(self, name: str) -> bool:
        return self.path(name).is_file()

    def delete(self, name: str) -> bool:
        p = self.path(name)
        if p.is_file():
            p.unlink()
            return True
        return False

    def list(self) -> list[WorkspaceFile]:
        out: list[WorkspaceFile] = []
        root = self.root.resolve()
        for p in sorted(root.rglob("*")):
            rel = p.relative_to(root)
            if p.is_file() and not any(part.startswith(".") for part in rel.parts):
                out.append(WorkspaceFile(str(rel), p.stat().st_size, p.suffix.lower() in IMAGE_EXT))
        return out
