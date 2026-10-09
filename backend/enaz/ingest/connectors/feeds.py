"""Live feed connectors: RSS/Atom and XML sitemaps.

Both hit the network for real content (no fixtures) and support incremental sync:
RSS/Atom skips entries older than the stored cursor, so scheduled runs only index
what is new.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import AsyncIterator
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree as ET

import httpx

from ..parsers import parse_html
from ..pipeline import SourceDocument
from .base import Connector, ConnectorMeta, register

_ATOM = "{http://www.w3.org/2005/Atom}"


def _text(el) -> str:
    return (el.text or "").strip() if el is not None else ""


def _parse_date(value: str) -> float:
    if not value:
        return 0.0
    try:
        return parsedate_to_datetime(value).timestamp()
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


@register
class RSSConnector(Connector):
    """Index items from an RSS 2.0 or Atom feed."""

    meta = ConnectorMeta(
        type="rss", name="RSS / Atom feed", category="Other", sync="poll", acl=False, logo="rss",
        config_fields=[
            {"key": "url", "label": "Feed URL", "type": "text", "required": True},
            {"key": "principal", "label": "Who can see it", "type": "text", "required": False},
        ],
    )

    async def fetch(self, cursor: str | None = None) -> AsyncIterator[SourceDocument]:
        url = self.config["url"].strip()
        principal = self.config.get("principal") or "public"
        since = _parse_date(cursor) if cursor else 0.0
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers={"User-Agent": "EnazBot/1.0"}) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            root = ET.fromstring(resp.content)

        # RSS: rss/channel/item ; Atom: feed/entry
        items = root.findall(".//item")
        is_atom = False
        if not items:
            items = root.findall(f".//{_ATOM}entry")
            is_atom = True

        for item in items:
            if is_atom:
                title = _text(item.find(f"{_ATOM}title"))
                link_el = item.find(f"{_ATOM}link")
                link = link_el.get("href") if link_el is not None else ""
                body = _text(item.find(f"{_ATOM}content")) or _text(item.find(f"{_ATOM}summary"))
                ext = _text(item.find(f"{_ATOM}id")) or link
                updated = _parse_date(_text(item.find(f"{_ATOM}updated")) or _text(item.find(f"{_ATOM}published")))
            else:
                title = _text(item.find("title"))
                link = _text(item.find("link"))
                body = _text(item.find("description")) or _text(item.find("{http://purl.org/rss/1.0/modules/content/}encoded"))
                ext = _text(item.find("guid")) or link
                updated = _parse_date(_text(item.find("pubDate")))
            if since and updated and updated <= since:
                continue
            # Strip any HTML in the body to clean text.
            parsed = parse_html(body, fallback_title=title or link, url=link or url)
            parsed.title = title or parsed.title
            yield SourceDocument(
                external_id=ext or title, title=title or "Untitled", source="rss", acl=[principal],
                parsed=parsed, url=link or None, path=urlparse(url).netloc, updated_at=updated,
            )
            await asyncio.sleep(0)


@register
class SitemapConnector(Connector):
    """Index every page listed in an XML sitemap (bounded)."""

    meta = ConnectorMeta(
        type="sitemap", name="Sitemap", category="Other", sync="poll", acl=False, logo="web",
        config_fields=[
            {"key": "url", "label": "sitemap.xml URL", "type": "text", "required": True},
            {"key": "max_pages", "label": "Max pages", "type": "number", "required": False},
            {"key": "principal", "label": "Who can see it", "type": "text", "required": False},
        ],
    )

    async def fetch(self, cursor: str | None = None) -> AsyncIterator[SourceDocument]:
        url = self.config["url"].strip()
        principal = self.config.get("principal") or "public"
        max_pages = int(self.config.get("max_pages") or 50)
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers={"User-Agent": "EnazBot/1.0"}) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            root = ET.fromstring(resp.content)
            # Sitemap namespace is usually declared; match loc regardless of ns.
            locs = [el.text.strip() for el in root.iter() if el.tag.endswith("loc") and el.text]
            count = 0
            for loc in locs:
                if count >= max_pages:
                    break
                try:
                    page = await client.get(loc)
                    if page.status_code != 200 or "html" not in page.headers.get("content-type", ""):
                        continue
                except httpx.HTTPError:
                    continue
                parsed = parse_html(page.text, fallback_title=loc, url=loc)
                yield SourceDocument(
                    external_id=loc, title=parsed.title, source="web", acl=[principal],
                    parsed=parsed, url=loc, path=urlparse(loc).netloc,
                )
                count += 1
                await asyncio.sleep(0)
