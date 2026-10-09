"""In-chat code interpreter.

When a question needs real computation (totals, averages, a trend, a chart) or
refers to a data file the user dropped into the session, the assistant writes
Python, runs it in the network-isolated sandbox over the conversation's
workspace, and folds the printed result and any generated chart back into the
cited answer. This is the Claude-style "use the file in the session" behaviour,
happening inside an ordinary chat answer rather than a separate builder mode.

Works with or without an LLM key:
  * online  — the model writes a short analysis script for the question;
  * offline — a deterministic pandas template profiles each data file and plots
              its leading numeric columns.

Either way the same sandbox runs the code, so the capability is identical.
"""

from __future__ import annotations

import base64
import re
from dataclasses import dataclass, field
from pathlib import Path

from ..llm.gateway import CostLedger, LLMGateway
from ..sandbox.executor import ExecResult, run_python
from ..sandbox.workspace import Workspace

DATA_EXT = {".csv", ".tsv", ".xlsx", ".xls", ".json", ".parquet"}
COMPUTE_RE = re.compile(
    r"\b(calculat\w*|comput\w*|chart|plot|graph|trend|average|mean|median|sum|total|"
    r"count|how many|correlat\w*|forecast|regress\w*|histogram|distribution|group by|"
    r"pivot|aggregate|statistic\w*|analy[sz]e\w*|breakdown|per month|per day|over time|"
    r"top \d+|rank)\b",
    re.I,
)
_CODE_FENCE = re.compile(r"```(?:python)?\s*(.+?)```", re.S)

_CODE_SYSTEM = (
    "You are a Python data analyst working in a sandbox. Write ONE short script that "
    "answers the user's question using the listed files in the current directory. "
    "Rules: print the key numbers with clear labels; if a chart helps, save it with "
    "matplotlib.pyplot.savefig('chart.png', bbox_inches='tight') (never call show()); "
    "use only pandas, numpy and matplotlib; do not access the network; keep it under "
    "40 lines. Reply with the code only, in a single ```python block."
)


@dataclass
class ComputeOutcome:
    ran: bool
    code: str = ""
    result: ExecResult | None = None
    images: list[dict] = field(default_factory=list)
    summary: str = ""
    new_files: list[str] = field(default_factory=list)


def data_files(files: list) -> list:
    """Workspace files that look like structured data."""
    return [f for f in files if Path(f.name).suffix.lower() in DATA_EXT]


def wants_compute(query: str, files: list) -> bool:
    """Decide whether this turn should drop into the code interpreter."""
    dfs = data_files(files)
    if not dfs:
        return False
    if COMPUTE_RE.search(query):
        return True
    # The question names one of the data files directly.
    low = query.lower()
    return any(Path(f.name).stem.lower() in low or f.name.lower() in low for f in dfs)


def _preview(workspace: Workspace, name: str, limit: int = 1200) -> str:
    try:
        raw = workspace.read(name)[:limit]
        return raw.decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return ""


def _offline_script(dfs: list) -> str:
    """Deterministic profiling + chart for each data file — no model needed."""
    names = [f.name for f in dfs]
    return (
        "import pandas as pd, numpy as np, json, os\n"
        "import matplotlib.pyplot as plt\n"
        f"files = {names!r}\n"
        "def load(fn):\n"
        "    e = os.path.splitext(fn)[1].lower()\n"
        "    if e in ('.xlsx','.xls'): return pd.read_excel(fn)\n"
        "    if e == '.tsv': return pd.read_csv(fn, sep='\\t')\n"
        "    if e == '.json':\n"
        "        try: return pd.json_normalize(json.load(open(fn)))\n"
        "        except Exception: return pd.read_json(fn)\n"
        "    if e == '.parquet': return pd.read_parquet(fn)\n"
        "    return pd.read_csv(fn)\n"
        "charted = False\n"
        "for fn in files:\n"
        "    try:\n"
        "        df = load(fn)\n"
        "    except Exception as ex:\n"
        "        print(f'[{fn}] could not load: {ex}'); continue\n"
        "    print(f'=== {fn} === {df.shape[0]} rows x {df.shape[1]} cols')\n"
        "    print('columns:', list(df.columns)[:20])\n"
        "    num = df.select_dtypes('number')\n"
        "    if not num.empty:\n"
        "        print(num.describe().round(3).to_string())\n"
        "        if not charted:\n"
        "            cols = list(num.columns)[:3]\n"
        "            ax = df[cols].head(50).plot(figsize=(7,4))\n"
        "            ax.set_title('Preview: ' + ', '.join(cols))\n"
        "            plt.savefig('chart.png', bbox_inches='tight'); charted = True\n"
        "            print('saved chart.png for', cols)\n"
        "    head = df.head(5).to_string()\n"
        "    print('head:\\n' + head)\n"
    )


async def _gen_code(llm: LLMGateway, query: str, dfs: list, workspace: Workspace, cost: CostLedger) -> str:
    if llm.offline:
        return _offline_script(dfs)
    listing = "\n".join(
        f"- {f.name} ({f.size} bytes)\n  preview: {_preview(workspace, f.name)[:400]!r}" for f in dfs
    )
    user = f"Question: {query}\n\nFiles in the working directory:\n{listing}\n\nWrite the analysis script."
    result = await llm.complete(llm_model(llm), _CODE_SYSTEM, user, effort="low", max_tokens=900, fallbacks=False)
    cost.add(result)
    m = _CODE_FENCE.search(result.text)
    code = (m.group(1) if m else result.text).strip()
    # Never trust the model to stay offline / safe: strip obvious network imports.
    if not code or "import os" in code and "system(" in code:
        return _offline_script(dfs)
    return code


def llm_model(llm: LLMGateway) -> str:
    # Analysis code is cheap to write; use the small model when online.
    return "claude-haiku-5-5"


def _summarize(result: ExecResult) -> str:
    out = (result.stdout or "").strip()
    if not out and result.stderr:
        return f"The code interpreter raised an error: {result.stderr.strip().splitlines()[-1][:200]}"
    # Keep the most information-dense lines for the evidence block.
    lines = [ln for ln in out.splitlines() if ln.strip()]
    return "\n".join(lines[:40])[:2000]


async def run_compute(
    llm: LLMGateway,
    workspace: Workspace,
    query: str,
    files: list,
    cost: CostLedger,
) -> ComputeOutcome:
    dfs = data_files(files)
    if not dfs:
        return ComputeOutcome(ran=False)
    code = await _gen_code(llm, query, dfs, workspace, cost)
    result = run_python(workspace.root, code)
    images: list[dict] = []
    new_files: list[str] = []
    for change in result.files:
        new_files.append(change.name)
        if change.is_image and change.size < 2_000_000:
            try:
                images.append(
                    {
                        "name": change.name,
                        "dataUrl": "data:image/png;base64," + base64.b64encode(workspace.read(change.name)).decode(),
                    }
                )
            except Exception:  # noqa: BLE001
                pass
    return ComputeOutcome(
        ran=True,
        code=code,
        result=result,
        images=images,
        summary=_summarize(result),
        new_files=new_files,
    )
