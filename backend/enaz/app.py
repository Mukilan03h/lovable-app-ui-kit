"""Enaz Knowledge API — FastAPI application factory."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings, get_settings
from .services import Services

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("enaz")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings: Settings = app.state.settings
    services = Services(settings)
    applied = await services.startup()
    if applied:
        log.info("applied migrations: %s", applied)

    # Optional Redis for cache / rate limits / SSE fan-out.
    services.redis = None  # type: ignore[attr-defined]
    if settings.redis_url:
        try:
            import redis.asyncio as redis

            services.redis = redis.from_url(settings.redis_url, decode_responses=True)  # type: ignore[attr-defined]
            await services.redis.ping()
            log.info("connected to Redis")
        except Exception as exc:  # noqa: BLE001
            log.warning("Redis unavailable (%s); using in-process fallbacks", exc)
            services.redis = None  # type: ignore[attr-defined]

    if settings.seed_sample_data:
        from .seed import seed

        info = await seed(services)
        log.info("seed: %s", info)

    app.state.services = services
    log.info("Enaz backend ready — LLM %s", "offline" if services.llm.offline else "online")
    try:
        yield
    finally:
        if getattr(services, "redis", None):
            await services.redis.aclose()
        await services.shutdown()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Enaz Knowledge API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from .api.routers import admin, agents, artifacts, assistant, auth, connectors, insights, mcp, sandbox, scim, search, settings as settings_router

    for module in (auth, assistant, search, connectors, artifacts, agents, settings_router, insights, admin, scim, mcp, sandbox):
        app.include_router(module.router)

    @app.get("/api/health")
    async def health() -> dict:
        svc: Services = app.state.services
        async with svc.db.acquire() as conn:
            await conn.execute("SELECT 1")
        return {"status": "ok", "llm": "offline" if svc.llm.offline else "online",
                "embedder": svc.embedder.name}

    @app.exception_handler(Exception)
    async def unhandled(request, exc):  # noqa: ANN001
        log.exception("unhandled error")
        return JSONResponse(status_code=500, content={"detail": "Internal error"})

    return app


app = create_app()
