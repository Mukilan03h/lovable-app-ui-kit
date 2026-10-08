"""Connector framework.

A connector knows how to pull documents (with their source permissions) from an
external system. Each returns `SourceDocument`s that the ingestion pipeline
chunks, embeds and indexes. New connectors register themselves so the catalog and
the admin UI can list and configure them.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator, Callable

from ..pipeline import SourceDocument


@dataclass
class ConnectorMeta:
    type: str
    name: str
    category: str
    sync: str            # webhook | poll | federated | upload
    acl: bool            # mirrors source permissions
    logo: str            # BrandLogo id used by the frontend
    config_fields: list[dict]  # [{key,label,type,required,secret?}]


class Connector:
    meta: ConnectorMeta

    def __init__(self, config: dict):
        self.config = config

    async def fetch(self, cursor: str | None = None) -> AsyncIterator[SourceDocument]:
        """Yield documents. `cursor` enables incremental sync; None = full sync."""
        raise NotImplementedError
        yield  # pragma: no cover


_REGISTRY: dict[str, type[Connector]] = {}


def register(cls: type[Connector]) -> type[Connector]:
    _REGISTRY[cls.meta.type] = cls
    return cls


def get_connector(type_: str, config: dict) -> Connector:
    if type_ not in _REGISTRY:
        raise KeyError(f"Unknown connector type: {type_}")
    return _REGISTRY[type_](config)


def catalog() -> list[ConnectorMeta]:
    return [cls.meta for cls in _REGISTRY.values()]


def has(type_: str) -> bool:
    return type_ in _REGISTRY
