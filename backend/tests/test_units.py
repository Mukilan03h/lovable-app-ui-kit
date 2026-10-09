"""Unit tests for the pure modules (no database)."""

from __future__ import annotations

from enaz.answer.ledger import Ledger, parse_paragraphs, verify
from enaz.config import Settings
from enaz.decision.router import DecisionRouter
from enaz.ingest.chunker import chunk_document
from enaz.ingest.parsers import parse_markdown, parse_text
from enaz.llm.gateway import LLMGateway, price_of
from enaz.retrieval.embeddings import HashingEmbedder
from enaz.retrieval.search import Hit


def _hit(n_title, text):
    return Hit(chunk_id=f"c{n_title}", doc_id=f"d{n_title}", title=n_title, source="drive", url=None, path="",
               doc_type="doc", owner="", updated_at=0.0, section="", text=text, context=n_title, parent_text=text, score=1.0)


def test_chunker_adds_context_header():
    doc = parse_markdown("Doc", "# Title\n\nFirst section body about retrieval.\n\n## Sub\n\nMore detail here.")
    chunks = chunk_document(doc, path="Wiki")
    assert chunks
    # Every chunk carries the document title in its context for contextual retrieval.
    assert all("Title" in c.context for c in chunks)


def test_chunker_respects_size():
    big = parse_text("Big", " ".join(f"Sentence number {i} with some words." for i in range(400)))
    chunks = chunk_document(big)
    assert len(chunks) > 1
    assert all(c.tokens <= 600 for c in chunks)


def test_router_heuristics():
    router = DecisionRouter(LLMGateway(offline=True), Settings())
    assert router.heuristic("make a deck about Q3 results").intent == "create"
    assert router.heuristic("make a deck about Q3 results").artifact == "slides"
    assert router.heuristic("export the numbers to a spreadsheet").artifact == "sheet"
    assert router.heuristic("who owns the GA fix?").intent == "lookup"
    assert router.heuristic("compare our pricing against competitors across all regions").intent == "research"
    # Forced modes override.
    assert router.heuristic("anything", mode="research").path == "agent"


def test_router_picks_cheaper_path_for_lookups():
    router = DecisionRouter(LLMGateway(offline=True), Settings(model_standard="claude-sonnet-5-5"))
    r = router.heuristic("what is the PTO policy?")
    assert r.path == "quick" and r.effort == "low"


async def test_laya_system1_skips_model_and_spends_no_tokens():
    """With Laya on, classify() never calls the LLM and reports zero router cost."""

    class _BoomGateway(LLMGateway):
        async def complete(self, *args, **kwargs):  # type: ignore[override]
            raise AssertionError("Laya System-1 must not call the model")

    router = DecisionRouter(_BoomGateway(offline=False), Settings())
    route = await router.classify("compare our pricing across all regions", system1=True)
    assert route.by == "laya-system1"
    assert getattr(route, "router_cost", 0.0) == 0.0
    # Heuristic intent is still correct without any model call.
    assert route.intent == "research"


async def test_laya_default_follows_workspace_setting():
    """classify() honours the workspace default when system1 is left unset."""
    router = DecisionRouter(LLMGateway(offline=True), Settings(laya_system1_default=True))
    route = await router.classify("who owns the GA fix?")
    assert route.by == "laya-system1" and route.intent == "lookup"


def test_compute_intent_detection():
    """The code interpreter engages only with data files + a compute-shaped ask."""
    from types import SimpleNamespace

    from enaz.answer.compute import data_files, wants_compute

    csv = SimpleNamespace(name="sales.csv", size=100, is_image=False)
    png = SimpleNamespace(name="chart.png", size=100, is_image=True)
    assert data_files([csv, png]) == [csv]
    assert wants_compute("what is the average revenue?", [csv]) is True
    assert wants_compute("plot the trend", [csv]) is True
    assert wants_compute("summarise sales.csv", [csv]) is True  # names the file
    assert wants_compute("average revenue", []) is False        # no data file
    assert wants_compute("hello there", [csv]) is False         # no compute intent


async def test_compute_runs_offline_over_a_csv(tmp_path):
    """End to end: offline code generation + sandbox run profiles a CSV and charts it."""
    from enaz.answer.compute import run_compute
    from enaz.llm.gateway import CostLedger
    from enaz.sandbox.workspace import Workspace

    ws = Workspace(tmp_path, "t1", "conv1")
    ws.write_text("sales.csv", "month,revenue\nJan,120\nFeb,150\nMar,200\n")
    outcome = await run_compute(LLMGateway(offline=True), ws, "total revenue and chart it", ws.list(), CostLedger())
    assert outcome.ran and outcome.result is not None and outcome.result.ok()
    assert "revenue" in outcome.summary
    assert any(f.endswith(".png") for f in outcome.new_files)


def test_vectorstore_selection_and_qdrant_payload():
    """Default backend is pgvector; the Qdrant payload/filter carry tenant + ACL."""
    from enaz.config import Settings
    from enaz.retrieval.vectorstore import (
        PgVectorStore, QdrantVectorStore, build_vector_store, qdrant_filter, qdrant_point,
    )

    assert isinstance(build_vector_store(Settings()), PgVectorStore)
    assert isinstance(build_vector_store(Settings(vector_backend="qdrant")), QdrantVectorStore)

    pt = qdrant_point("c1", "d1", [0.1, 0.2, 0.3], ["Public", "group:eng"], tenant="t1")
    assert pt["id"] == "c1"
    assert pt["payload"] == {
        "chunk_id": "c1", "doc_id": "d1", "tenant": "t1", "acl": ["public", "group:eng"],
    }
    assert pt["vector"] == [0.1, 0.2, 0.3]

    # The ACL filter is an OR over the caller's principals (lower-cased).
    flt = qdrant_filter(["Public", "Group:Eng"])
    assert flt["should"] == [
        {"key": "acl", "match": {"value": "public"}},
        {"key": "acl", "match": {"value": "group:eng"}},
    ]


def test_openapi_import_parses_operations():
    """The action builder flattens an OpenAPI 3 doc into callable actions."""
    from enaz.api.routers.skills import _parse_openapi, slugify

    spec = {
        "openapi": "3.0.0",
        "info": {"title": "Ticket API"},
        "servers": [{"url": "https://api.example.com/v1"}],
        "paths": {
            "/tickets": {
                "get": {"operationId": "listTickets", "summary": "List"},
                "post": {"operationId": "createTicket", "requestBody": {}},
            },
            "/tickets/{id}": {
                "get": {"parameters": [{"name": "id", "in": "path", "required": True}]},
            },
        },
    }
    title, actions = _parse_openapi(spec, None)
    assert slugify(title) == "ticket-api"
    by_name = {a["name"]: a for a in actions}
    assert by_name["listTickets"]["method"] == "GET"
    assert {"name": "body", "in": "body", "required": True} in by_name["createTicket"]["parameters"]
    # Path with no operationId gets a synthesised name and keeps its path param.
    getter = next(a for a in actions if a["path"] == "/tickets/{id}" and a["method"] == "GET")
    assert any(p["name"] == "id" and p["in"] == "path" for p in getter["parameters"])


def test_verifier_flags_unsupported_claims():
    emb = HashingEmbedder(256)
    ledger = Ledger.from_hits([
        _hit("Doc A", "The GA launch is blocked by SharePoint permission sync."),
        _hit("Doc B", "Latency improved to two seconds."),
    ])
    answer = "The launch is blocked by SharePoint permission sync [1]. The moon is made of cheese [2]."
    v = verify(answer, ledger, emb)
    assert v.total == 2
    assert v.supported == 1
    assert any("cheese" in u for u in v.unsupported)


def test_parse_paragraphs_extracts_citations():
    paras = parse_paragraphs("First claim [1].\n\nSecond claim [2][3].")
    assert paras[0]["cites"] == [1]
    assert paras[1]["cites"] == [2, 3]


def test_offline_gateway_is_grounded():
    gw = LLMGateway(offline=True)
    import asyncio

    prompt = "Question: what blocks launch?\n\nEvidence:\n[1] (GA — slack) SharePoint permission sync blocks the launch.\n[2] (X — drive) Unrelated note about lunch."
    result = asyncio.run(gw.complete("claude-sonnet-5-5", "system", prompt))
    assert result.offline
    assert "[1]" in result.text
    assert "(GA — slack)" not in result.text  # metadata stripped


def test_price_of_discounts_cache():
    full = price_of("claude-sonnet-5-5", 1000, 500, cached_tokens=0)
    cached = price_of("claude-sonnet-5-5", 1000, 500, cached_tokens=1000)
    assert cached < full
