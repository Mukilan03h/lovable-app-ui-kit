"""Runtime configuration, read from environment variables (prefix ENAZ_)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ENAZ_", env_file=".env", extra="ignore")

    # ---- storage ----------------------------------------------------------
    # PostgreSQL 16 + pgvector is the primary store. A DSN is required in
    # production; tests inject their own.
    database_url: str = "postgresql://enaz_app@127.0.0.1:5433/enaz"
    # Superuser DSN used only to run migrations (CREATE EXTENSION / ROLE / policies)
    # and to seed across tenants. Defaults to the owner role.
    admin_database_url: str = "postgresql://enaz@127.0.0.1:5433/enaz"
    db_pool_min: int = 2
    db_pool_max: int = 16
    redis_url: str | None = None  # optional: cache, rate limits, SSE fan-out

    data_dir: Path = Path("data")

    # ---- auth / tenancy ---------------------------------------------------
    secret_key: str = "change-me-in-production"
    token_ttl_hours: int = 12
    default_tenant_slug: str = "acme"
    default_tenant_name: str = "Acme Corp"
    # Demo mode seeds sample users and lets the frontend "sign in as role".
    demo_mode: bool = True
    seed_sample_data: bool = True

    cors_origins: list[str] = [
        "http://localhost:8080",
        "http://localhost:5173",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:5173",
    ]

    # ---- models (decision layer tiers) ------------------------------------
    model_small: str = "claude-haiku-5-5"
    model_standard: str = "claude-sonnet-5-5"
    model_deep: str = "claude-opus-5-5"
    llm_offline: bool | None = None  # None = auto-detect from credentials

    # Laya "System 1" fast-decision default. When true, intent routing uses a
    # zero-token heuristic instead of a small-model classify call. Users can
    # override per-account in Settings; this is the workspace fallback.
    laya_system1_default: bool = True

    # ---- retrieval providers ----------------------------------------------
    embedding_provider: str = "hashing"  # "hashing" (offline) | "voyage"
    embedding_dim: int = 512
    voyage_api_key: str | None = None
    voyage_model: str = "voyage-3.5"
    rerank_provider: str = "local"  # "local" | "cohere"
    cohere_api_key: str | None = None

    # Vector backend: "pgvector" (default, vectors in Postgres) or "qdrant"
    # (dedicated ANN cluster for very large / high-QPS deployments).
    vector_backend: str = "pgvector"
    qdrant_url: str = "http://127.0.0.1:6333"
    qdrant_api_key: str | None = None
    qdrant_collection: str = "enaz_chunks"

    max_upload_mb: int = 50
    rate_limit_per_minute: int = 120

    # Background connector scheduler: runs due connectors on their refresh cadence.
    scheduler_enabled: bool = True
    scheduler_interval_seconds: int = 60

    # Web search provider for the "Web" toggle: "none" | "searxng".
    web_search_provider: str = "none"
    searxng_url: str | None = None

    @property
    def files_dir(self) -> Path:
        return self.data_dir / "files"


@lru_cache
def get_settings() -> Settings:
    return Settings()
