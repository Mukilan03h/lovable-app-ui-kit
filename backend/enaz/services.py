"""Application service container: builds and holds every engine, once."""

from __future__ import annotations

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
        self.index = DocumentIndex()
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

    async def startup(self) -> list[str]:
        applied = await self.db.migrate()
        await self.db.connect()
        return applied

    async def shutdown(self) -> None:
        await self.db.close()
