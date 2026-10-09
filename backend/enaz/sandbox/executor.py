"""Sandboxed Python execution for the code interpreter.

Each run executes in a per-session workspace directory with:
  * a fresh network namespace (`unshare -rn`) so code cannot reach the network,
  * CPU / memory / file-size / process rlimits (runaway code is killed),
  * a scrubbed environment (no API keys, no proxy),
  * a wall-clock timeout.

This is genuine isolation for a single-node deployment. For untrusted
multi-tenant production load, run each cell in a gVisor or Firecracker microVM
(the interface here — workspace dir + code in, result + files out — is identical,
so the executor swaps without touching callers).
"""

from __future__ import annotations

import os
import resource
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

# Does `unshare -rn` work here? Probed once at import.
_UNSHARE = shutil.which("unshare")


def _unshare_ok() -> bool:
    if not _UNSHARE:
        return False
    try:
        r = subprocess.run([_UNSHARE, "-rn", "true"], capture_output=True, timeout=5)
        return r.returncode == 0
    except Exception:
        return False


HAS_NET_ISOLATION = _unshare_ok()


@dataclass
class FileChange:
    name: str
    size: int
    is_new: bool
    is_image: bool


@dataclass
class ExecResult:
    stdout: str
    stderr: str
    return_code: int
    timed_out: bool
    duration_ms: int
    files: list[FileChange] = field(default_factory=list)
    network_isolated: bool = HAS_NET_ISOLATION

    def ok(self) -> bool:
        return self.return_code == 0 and not self.timed_out


IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"}
# matplotlib must render headless inside the sandbox.
_PRELUDE = "import matplotlib\nmatplotlib.use('Agg')\n"


def _limits(cpu_seconds: int, mem_bytes: int, fsize_bytes: int):
    def apply() -> None:
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1))
        resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))
        resource.setrlimit(resource.RLIMIT_FSIZE, (fsize_bytes, fsize_bytes))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        try:
            resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
        except (ValueError, OSError):
            pass
        os.setsid()

    return apply


def _hidden(rel: Path) -> bool:
    return any(part.startswith(".") for part in rel.parts)


def _snapshot(workspace: Path) -> dict[str, float]:
    out: dict[str, float] = {}
    for p in workspace.rglob("*"):
        if p.is_file():
            rel = p.relative_to(workspace)
            if not _hidden(rel):
                out[str(rel)] = p.stat().st_mtime
    return out


def run_python(
    workspace: Path,
    code: str,
    *,
    timeout: int = 25,
    cpu_seconds: int = 20,
    mem_mb: int = 768,
    fsize_mb: int = 64,
) -> ExecResult:
    workspace.mkdir(parents=True, exist_ok=True)
    workspace = workspace.resolve()
    # matplotlib's font cache lives outside the session workspace so it never
    # pollutes the user's file list.
    mpl_cache = workspace.parent / ".mplcache"
    mpl_cache.mkdir(parents=True, exist_ok=True)
    before = _snapshot(workspace)

    argv: list[str] = []
    if HAS_NET_ISOLATION:
        argv += [_UNSHARE, "-rn"]
    argv += [sys.executable, "-I", "-"]

    env = {
        "PATH": "/usr/bin:/bin",
        "HOME": str(workspace),
        "TMPDIR": str(workspace),
        "PYTHONDONTWRITEBYTECODE": "1",
        "MPLBACKEND": "Agg",
        "MPLCONFIGDIR": str(mpl_cache),
    }

    started = time.perf_counter()
    timed_out = False
    try:
        proc = subprocess.run(
            argv,
            input=(_PRELUDE + code).encode(),
            cwd=str(workspace),
            env=env,
            capture_output=True,
            timeout=timeout,
            preexec_fn=_limits(cpu_seconds, mem_mb * 1024 * 1024, fsize_mb * 1024 * 1024),
        )
        stdout, stderr, rc = proc.stdout.decode("utf-8", "replace"), proc.stderr.decode("utf-8", "replace"), proc.returncode
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        stdout = (exc.stdout or b"").decode("utf-8", "replace")
        stderr = (exc.stderr or b"").decode("utf-8", "replace") + f"\n[killed: exceeded {timeout}s wall-clock limit]"
        rc = -1

    duration = int((time.perf_counter() - started) * 1000)
    after = _snapshot(workspace)
    changes: list[FileChange] = []
    for name, mtime in after.items():
        if name not in before or before[name] != mtime:
            p = workspace / name
            changes.append(FileChange(name=name, size=p.stat().st_size, is_new=name not in before,
                                      is_image=p.suffix.lower() in IMAGE_EXT))
    return ExecResult(stdout=stdout, stderr=stderr, return_code=rc, timed_out=timed_out,
                      duration_ms=duration, files=sorted(changes, key=lambda c: c.name))
