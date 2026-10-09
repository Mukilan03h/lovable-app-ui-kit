# Enaz Knowledge — Backend

Permission-aware enterprise search, agentic answers, artifacts, and a
code-interpreter sandbox — built to beat Onyx including its paid tier.

## Stack

- **FastAPI** (async) + **asyncpg**
- **PostgreSQL 16 + pgvector** — vectors (HNSW) + native full-text (`tsvector`),
  with **row-level security** for multi-tenant isolation
- **Anthropic SDK** with a decision-layer router (Haiku → Sonnet → Opus),
  prompt caching, server-side fallbacks, and a cost ledger — plus an **offline
  extractive engine** so everything works with no API key
- **markitdown** (parsing), **readability** (web), **SearXNG** (web search)
- **Redis** (optional) for cache / rate limits / SSE fan-out
- Network-isolated Python **sandbox** (`unshare -rn` + rlimits) for the code
  interpreter

## Run

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -e .            # or: pip install -r requirements (see pyproject)

# Postgres + pgvector must be reachable. For local dev the helper starts them:
bash scripts/dev-services.sh

# Migrations run automatically on startup; sample data is seeded in demo mode.
uvicorn enaz.app:app --host 127.0.0.1 --port 8099
```

Key env vars (prefix `ENAZ_`):

| Var | Default | Notes |
| --- | --- | --- |
| `ENAZ_DATABASE_URL` | `postgresql://enaz_app@127.0.0.1:5433/enaz` | app role (RLS-enforced) |
| `ENAZ_ADMIN_DATABASE_URL` | `postgresql://enaz@127.0.0.1:5433/enaz` | owner role (migrations) |
| `ENAZ_LLM_OFFLINE` | auto | `true` forces the offline engine |
| `ENAZ_EMBEDDING_PROVIDER` | `hashing` | `voyage` for neural embeddings (re-index after) |
| `ENAZ_RERANK_PROVIDER` | `local` | `cohere` for a hosted reranker |
| `ENAZ_SEARXNG_URL` | — | enables the Web toggle |
| `ENAZ_REDIS_URL` | — | optional |
| `ANTHROPIC_API_KEY` | — | enables online LLM (SDK resolves it) |

Connect the frontend by setting `VITE_API_URL=http://127.0.0.1:8099` (the UI
falls back to bundled mock data when it is unset).

## Tests

```bash
PYTHONPATH=. .venv/bin/python -m pytest -q
```

26 tests cover auth, RBAC, tenant isolation (RLS), ACL-filtered search, streaming
answers, artifacts + Office render, the code-interpreter sandbox (incl. network
block), SCIM, MCP, and the universal connector catalog.

## Layout

```
enaz/
  app.py            FastAPI app + lifespan (migrate, seed, services)
  config.py         settings
  db.py             async pool, migrations, per-request tenant (RLS) context
  security.py       JWT, API tokens, RBAC, principals
  migrations/       SQL (schema, RLS policies, session files)
  retrieval/        embeddings, pgvector+FTS index, hybrid search + rerank
  ingest/           parsers, markitdown, chunker, pipeline, connectors/, web_search
  decision/         router (cost lever), semantic cache
  llm/              gateway (routing, caching, fallbacks, offline engine)
  answer/           evidence ledger, verifier, streaming answer + deep research
  artifacts/        typed specs, Office renderers, versioning
  sandbox/          network-isolated executor + per-session workspace
  evals/            golden-set quality gate
  api/              deps (auth/rate limit) + routers
  seed.py           demo tenant, users, sample documents
```

See `../docs/PLAN.md` for the full architecture, competitive analysis, and the
Onyx gap table.
