"""Application service container: builds and holds every engine, once."""

from __future__ import annotations

import asyncio
import logging

from .answer.pipeline import AnswerService
from .artifacts.service import ArtifactService
from .config import Settings
from .db import Database
from .decision.cache import SemanticCache
from .decision.router import DecisionRouter
from .ingest.pipeline import IngestionService
from .ingest.web_search import WebSearch
from .llm.gateway import LLMGateway
from .retrieval.embeddings import build_embedder
from .retrieval.index import DocumentIndex
from .retrieval.search import CohereReranker, HybridSearcher, LocalReranker


class Services:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.db = Database(
            settings.database_url, settings.admin_database_url, settings.embedding_dim,
            settings.db_pool_min, settings.db_pool_max,
        )
        self.embedder = build_embedder(
            settings.embedding_provider, settings.embedding_dim, settings.voyage_api_key, settings.voyage_model
        )
        from .retrieval.vectorstore import build_vector_store

        self.index = DocumentIndex(build_vector_store(settings))
        reranker = (
            CohereReranker(settings.cohere_api_key)
            if settings.rerank_provider == "cohere" and settings.cohere_api_key
            else LocalReranker()
        )
        self.searcher = HybridSearcher(self.index, self.embedder, reranker)
        self.llm = LLMGateway(settings.llm_offline)
        self.router = DecisionRouter(self.llm, settings)
        self.cache = SemanticCache(self.db)
        self.ingest = IngestionService(self.db, self.index, self.embedder)
        self.web_search = WebSearch(settings.web_search_provider, settings.searxng_url)
        self.answers = AnswerService(
            self.db, self.searcher, self.embedder, self.router, self.cache, self.llm, settings
        )
        self.artifacts = ArtifactService(self.db, self.llm, settings)
        self._scheduler_task: asyncio.Task | None = None
        self._run_worker_task: asyncio.Task | None = None

    async def startup(self) -> list[str]:
        applied = await self.db.migrate()
        await self.db.connect()
        return applied

    def start_scheduler(self) -> None:
        """Start the background connector scheduler (idempotent)."""
        if not self.settings.scheduler_enabled or self._scheduler_task is not None:
            return
        self._scheduler_task = asyncio.create_task(self._scheduler_loop())

    def start_run_worker(self) -> None:
        """Start the durable agent-run worker (idempotent)."""
        if not self.settings.run_worker_enabled or self._run_worker_task is not None:
            return
        self._run_worker_task = asyncio.create_task(self._run_worker_loop())

    async def _run_worker_loop(self) -> None:
        from .run_engine import run_worker_once

        log = logging.getLogger("enaz.runworker")
        while True:
            try:
                did = await run_worker_once(self)
                await asyncio.sleep(0.2 if did else 2.0)  # drain fast, idle slow
            except asyncio.CancelledError:
                break
            except Exception as exc:  # noqa: BLE001 - keep the worker alive across errors
                log.warning("run worker error: %s", exc)
                await asyncio.sleep(2.0)

    async def _scheduler_loop(self) -> None:
        from .ingest.sync import due_connectors, mark_scheduled, run_sync

        log = logging.getLogger("enaz.scheduler")
        interval = max(10, self.settings.scheduler_interval_seconds)
        while True:
            try:
                await asyncio.sleep(interval)
                due = await due_connectors(self)
                for tenant_id, connector_id in due:
                    await mark_scheduled(self, tenant_id, connector_id)
                    try:
                        summary = await run_sync(self, tenant_id, connector_id, trigger="scheduled")
                        log.info("scheduled sync %s: %s", connector_id, summary)
                    except Exception as exc:  # noqa: BLE001 - one bad connector must not stop the loop
                        log.warning("scheduled sync failed for %s: %s", connector_id, exc)
            except asyncio.CancelledError:
                break
            except Exception as exc:  # noqa: BLE001 - keep the scheduler alive across errors
                log.warning("scheduler tick error: %s", exc)

    async def shutdown(self) -> None:
        for attr in ("_scheduler_task", "_run_worker_task"):
            task = getattr(self, attr, None)
            if task is not None:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):  # noqa: BLE001
                    pass
                setattr(self, attr, None)
        await self.db.close()
