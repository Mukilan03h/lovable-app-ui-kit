"""Insights: usage, answer quality, cost savings, model mix and knowledge gaps."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ...services import Services
from ..deps import Principal, get_services, require

router = APIRouter(prefix="/api/insights", tags=["insights"])


@router.get("")
async def insights(days: int = 7, principal: Principal = Depends(require("insights")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        totals = await conn.fetchrow(
            """SELECT count(*) AS queries,
                      avg(cost) AS avg_cost, sum(cost) AS total_cost, sum(baseline_cost) AS baseline_cost,
                      avg(latency_ms) AS avg_latency,
                      count(*) FILTER (WHERE answered) AS answered,
                      count(*) FILTER (WHERE cached) AS cached
               FROM query_log WHERE created_at > now() - make_interval(days => $1)""",
            days,
        )
        volume = await conn.fetch(
            """SELECT to_char(date_trunc('day', created_at), 'Dy') AS day,
                      count(*) AS queries, count(*) FILTER (WHERE answered) AS answered
               FROM query_log WHERE created_at > now() - make_interval(days => $1)
               GROUP BY date_trunc('day', created_at) ORDER BY date_trunc('day', created_at)""",
            days,
        )
        model_mix = await conn.fetch(
            "SELECT model, count(*) AS n FROM query_log WHERE created_at > now() - make_interval(days => $1) GROUP BY model ORDER BY n DESC",
            days,
        )
        p50 = await conn.fetchval(
            "SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FROM query_log WHERE created_at > now() - make_interval(days => $1)",
            days,
        )
        gaps = await conn.fetch(
            """SELECT query, count(*) AS asks FROM query_log
               WHERE NOT answered AND created_at > now() - make_interval(days => $1)
               GROUP BY query ORDER BY asks DESC LIMIT 10""",
            days,
        )

    q = totals["queries"] or 0
    total_cost = float(totals["total_cost"] or 0)
    baseline = float(totals["baseline_cost"] or 0)
    return {
        "stats": {
            "queries": q,
            "answerRate": round(100 * (totals["answered"] or 0) / q, 1) if q else 0,
            "p50LatencyMs": int(p50 or 0),
            "avgCost": round(float(totals["avg_cost"] or 0), 5),
            "totalCost": round(total_cost, 4),
            "baselineCost": round(baseline, 4),
            "savingsPct": round(100 * (1 - total_cost / baseline), 1) if baseline else 0,
            "cacheHitRate": round(100 * (totals["cached"] or 0) / q, 1) if q else 0,
        },
        "volume": [{"day": r["day"], "queries": r["queries"], "answered": r["answered"]} for r in volume],
        "modelMix": [{"name": r["model"] or "unknown", "value": r["n"]} for r in model_mix],
        "knowledgeGaps": [{"question": r["query"], "asks": r["asks"], "status": "No confident answer"} for r in gaps],
    }


@router.get("/history")
async def history(limit: int = 50, principal: Principal = Depends(require("insights")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            """SELECT q.query, q.path, q.model, q.cost, q.confidence, q.answered,
                      extract(epoch FROM q.created_at) AS created_at, u.avatar
               FROM query_log q LEFT JOIN users u ON u.id = q.user_id
               ORDER BY q.created_at DESC LIMIT $1""",
            limit,
        )
    return {"history": [
        {"query": r["query"], "path": r["path"], "model": r["model"], "cost": round(float(r["cost"] or 0), 5),
         "confidence": float(r["confidence"] or 0), "answered": r["answered"],
         "createdAt": r["created_at"], "avatar": r["avatar"] or "?"}
        for r in rows
    ]}
