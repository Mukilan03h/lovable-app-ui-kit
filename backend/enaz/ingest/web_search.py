"""Web search provider for the assistant's "Web" toggle.

SearXNG is a self-hosted, privacy-respecting metasearch engine — a good default
for enterprises that want web augmentation without sending queries to a third
party. Point ENAZ_SEARXNG_URL at an instance to enable it. With no provider
configured, web search returns empty (the assistant answers from internal
knowledge only).
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx


@dataclass
class WebResult:
    title: str
    url: str
    snippet: str

    def public(self) -> dict:
        return {"title": self.title, "url": self.url, "snippet": self.snippet}


class WebSearch:
    def __init__(self, provider: str = "none", searxng_url: str | None = None):
        self.provider = provider
        self.searxng_url = (searxng_url or "").rstrip("/")

    @property
    def enabled(self) -> bool:
        return self.provider == "searxng" and bool(self.searxng_url)

    async def search(self, query: str, limit: int = 6) -> list[WebResult]:
        if not self.enabled:
            return []
        try:
            async with httpx.AsyncClient(timeout=15, headers={"User-Agent": "EnazBot/1.0"}) as client:
                resp = await client.get(
                    f"{self.searxng_url}/search",
                    params={"q": query, "format": "json", "safesearch": "1"},
                )
                resp.raise_for_status()
                data = resp.json()
        except (httpx.HTTPError, ValueError):
            return []
        results = []
        for item in (data.get("results") or [])[:limit]:
            results.append(WebResult(
                title=item.get("title", ""), url=item.get("url", ""), snippet=item.get("content", "")
            ))
        return results
