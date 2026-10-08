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
