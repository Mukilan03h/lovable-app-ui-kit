"""Real connector implementations: web crawl, GitHub, and the upload sink.

These actually connect to the source system when configured — no fake data. The
catalog in `enaz.ingest.connectors.catalog_data` advertises the full set of
sources the platform targets; the ones with a class here fetch live content, and
the rest surface in the admin UI as "configure to connect".
"""

from __future__ import annotations

import asyncio
from typing import AsyncIterator
from urllib.parse import urljoin, urlparse

import httpx

from ..parsers import parse_bytes, parse_html
from ..pipeline import SourceDocument
from .base import Connector, ConnectorMeta, register


@register
class WebConnector(Connector):
    """Crawl a website starting from one or more seed URLs (same host, bounded)."""

    meta = ConnectorMeta(
        type="web", name="Website", category="Other", sync="poll", acl=False, logo="web",
        config_fields=[
            {"key": "seeds", "label": "Start URLs (one per line)", "type": "textarea", "required": True},
            {"key": "max_pages", "label": "Max pages", "type": "number", "required": False},
            {"key": "principal", "label": "Who can see it (principal)", "type": "text", "required": False},
        ],
    )

    async def fetch(self, cursor: str | None = None) -> AsyncIterator[SourceDocument]:
        seeds = [s.strip() for s in str(self.config.get("seeds", "")).splitlines() if s.strip()]
        max_pages = int(self.config.get("max_pages") or 25)
        principal = self.config.get("principal") or "public"
        seen: set[str] = set()
        queue = list(seeds)
        hosts = {urlparse(s).netloc for s in seeds}
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers={"User-Agent": "EnazBot/1.0"}) as client:
            while queue and len(seen) < max_pages:
                url = queue.pop(0)
                if url in seen or urlparse(url).netloc not in hosts:
                    continue
                seen.add(url)
                try:
                    resp = await client.get(url)
                    if resp.status_code != 200 or "html" not in resp.headers.get("content-type", ""):
                        continue
                except httpx.HTTPError:
                    continue
                parsed = parse_html(resp.text, fallback_title=url, url=url)
                yield SourceDocument(
                    external_id=url, title=parsed.title, source="web", acl=[principal],
                    parsed=parsed, url=url, path=urlparse(url).netloc,
                )
                from bs4 import BeautifulSoup

                for a in BeautifulSoup(resp.text, "html.parser").find_all("a", href=True):
                    nxt = urljoin(url, a["href"]).split("#")[0]
                    if nxt not in seen and urlparse(nxt).netloc in hosts:
                        queue.append(nxt)
                await asyncio.sleep(0)


@register
class GitHubConnector(Connector):
    """Index text/markdown/code files from a GitHub repository via the REST API."""

    meta = ConnectorMeta(
        type="github", name="GitHub", category="Code", sync="webhook", acl=True, logo="github",
        config_fields=[
            {"key": "repo", "label": "owner/repo", "type": "text", "required": True},
            {"key": "token", "label": "GitHub token", "type": "text", "required": False, "secret": True},
            {"key": "branch", "label": "Branch", "type": "text", "required": False},
            {"key": "principal", "label": "Who can see it (principal)", "type": "text", "required": False},
        ],
    )
    TEXT_EXT = {".md", ".txt", ".py", ".ts", ".tsx", ".js", ".go", ".java", ".rb", ".rs", ".json", ".yaml", ".yml", ".sql", ".sh"}

    async def fetch(self, cursor: str | None = None) -> AsyncIterator[SourceDocument]:
        repo = self.config["repo"].strip()
        token = self.config.get("token")
        principal = self.config.get("principal") or "public"
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "EnazBot/1.0"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        async with httpx.AsyncClient(timeout=30, headers=headers) as client:
            branch = self.config.get("branch")
            if not branch:
                info = await client.get(f"https://api.github.com/repos/{repo}")
                info.raise_for_status()
                branch = info.json().get("default_branch", "main")
            tree = await client.get(f"https://api.github.com/repos/{repo}/git/trees/{branch}?recursive=1")
            tree.raise_for_status()
            for node in tree.json().get("tree", []):
                if node["type"] != "blob":
                    continue
                path = node["path"]
                if not any(path.endswith(e) for e in self.TEXT_EXT) or node.get("size", 0) > 400_000:
                    continue
                raw = await client.get(f"https://raw.githubusercontent.com/{repo}/{branch}/{path}")
                if raw.status_code != 200:
                    continue
                parsed = parse_bytes(path, raw.content)
                yield SourceDocument(
                    external_id=f"{repo}:{path}", title=f"{repo}/{path}", source="github",
                    acl=[principal], parsed=parsed, path=f"github.com/{repo}",
                    url=f"https://github.com/{repo}/blob/{branch}/{path}",
                )
                await asyncio.sleep(0)
