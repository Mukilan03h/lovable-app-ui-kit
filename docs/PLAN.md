# Enaz Knowledge — Product, Research & Architecture Plan

> Goal: build an enterprise search + AI work platform that beats **Onyx** (open source, formerly Danswer)
> and **Glean** (closed, market leader) on answer quality, speed, cost, deployability and — the
> big gap in both — **producing finished work** (slides, Word docs, spreadsheets, reports) the way
> Claude does with artifacts.
>
> Status: plan + UI prototype (this repo). Date of analysis: October 2026.

---

## 0. TL;DR

1. **Don't build "a RAG chatbot".** Classic retrieve-top-k-then-answer RAG is now the *floor*, not the
   product. The winning architecture in 2026 is **agentic retrieval over a permission-aware hybrid
   index plus an enterprise graph**, with the LLM using search as a *tool* it can call many times,
   in parallel, and verify. RAG is a component; the agent loop is the architecture.
2. **Win where both competitors are weak:**
   - *Onyx*: strong open-source core, but heavy multi-service self-hosting, uneven admin UX, key
     enterprise features (permission sync, SSO extras) gated behind the paid edition, and generic
     chat output.
   - *Glean*: best-in-class graph and connectors, but expensive, closed, slow to deploy, hard to
     self-host / air-gap, and document *creation* is shallow compared to Claude-style artifacts.
3. **Our wedge = "Search → Answer → Deliverable."** Every answer can become a cited, editable,
   versioned artifact: PPTX, DOCX, XLSX, PDF, HTML dashboards — generated from a typed spec and
   rendered deterministically, so the files are clean and editable in Office.
4. **Efficiency is a feature:** single-binary/compose-light deployment, model routing (small model
   for 80% of calls), aggressive caching, incremental indexing, and context-management techniques
   (compaction, memory, sub-agents, tool-result clearing) to cut cost per answer 3–5× vs naive RAG.
5. **Ship in 4 phases over ~9 months** (section 12). The UI in this repo has already been converted
   into the product shell: Assistant (chat + artifacts canvas), Search, Connectors, Agents,
   Artifacts library and Insights.

---

## 1. Competitive teardown

### 1.1 Onyx (onyx.app, github.com/onyx-dot-app/onyx)

| Area | What they do | Weakness we can exploit |
| --- | --- | --- |
| Licensing | MIT core, paid Enterprise Edition | Teams discover permission sync / advanced SSO are not in the free edition |
| Connectors | 40+ (Drive, SharePoint, Slack, Confluence, Jira, GitHub, …) | Polling-heavy; freshness varies by connector; per-connector quality uneven |
| Search core | Hybrid (keyword + vector) on Vespa, cross-encoder rerank, Postgres for metadata, Celery workers, separate model server | Many moving parts (Vespa, Postgres, Redis, model server, background workers, web) → hard to operate, heavy RAM |
| Chat / agents | Custom agents with prompts, knowledge sets, actions (MCP, OpenAPI), web search, code interpreter, image gen | Agents are config-centric; little evaluation tooling; no process/workflow memory |
| Deep research | Multi-step research with parallel tool calls | Output is a long chat message, not a structured, editable deliverable |
| Deployment | Docker, Kubernetes, Terraform, air-gapped, any LLM incl. local | Ops complexity; reviewers cite uneven index visibility for admins |
| UX | Clean ChatGPT-like chat | Weak "work product" UX, limited analytics, limited personalization |

### 1.2 Glean (glean.com)

| Area | What they do | Weakness we can exploit |
| --- | --- | --- |
| Graph | **Enterprise Graph** (people, content, projects, processes, apps) + **Personal Graph** per employee (projects, collaborators, work style) — 6+ years of investment | Graph is closed and not inspectable/editable by customers |
| Assistant | 3rd-gen assistant; personalization; hands tasks to specialist agents; "Agentic Engine 2" | Black box; reasoning and sources not always transparent |
| Agents | Agent builder, autonomous agents (beta late 2025), moderators, action-level controls | Pricey; agents limited to their action catalogue |
| Actions / MCP | 100+ native actions via MCP servers; customers can deploy their own MCP servers | — |
| Canvas | Co-authoring UI for documents | Not a full Office-grade PPTX/XLSX generation pipeline |
| Business | ~$200M ARR, $7.2B valuation (2026) | High per-seat price with minimums; long sales cycles; SaaS-first (data residency / air-gap is hard) |

### 1.3 Where we must be at parity (table stakes)
Permission-aware search; 50+ connectors with real-time-ish freshness; SSO/SAML/OIDC + SCIM;
citations on every claim; Slack/Teams bot; browser extension; admin analytics; any-LLM support;
SOC 2 path.

### 1.4 Where we beat both (differentiators)
1. **Artifacts engine** – PPTX/DOCX/XLSX/PDF/HTML output with citations embedded, versioning,
   "edit by instruction", brand templates, round-trip editing of uploaded Office files.
2. **Transparent agentic research** – visible plan, live step timeline, per-claim citation with
   highlight, confidence score, "what I could not find" section.
3. **Open, inspectable enterprise graph** – admins and users can see/correct entities,
   owners, synonyms, expertise ("who knows about X").
4. **Lightweight deploy** – a single Postgres-centric stack for ≤5M docs (section 6.6), scale-out
   path only when needed. 15-minute self-host.
5. **Cost per answer** – model routing + caching + context management (section 8) → target
   ≤ $0.01 for a standard answer, ≤ $0.25 for deep research.
6. **Knowledge-gap analytics** – shows which questions failed and which docs are stale,
   duplicate or contradictory, with one-click "assign owner to fix".
7. **Workflows with memory** – agents learn team-specific procedures (approved memory, not silent).
8. **Fair pricing + free self-host with permission sync included** – removes Onyx's biggest
   adoption trap.

---

## 2. Is RAG still the right approach? (Deep analysis)

### 2.1 The options in 2026

| Approach | How it works | Strengths | Weaknesses | Verdict |
| --- | --- | --- | --- | --- |
| **Naive RAG** (chunk → embed → top-k → stuff prompt) | One retrieval, one generation | Simple, cheap | Fails multi-hop, aggregation ("all contracts expiring in Q3"), ambiguous queries; chunking loses context | Baseline only |
| **Long context only** (stuff 200K–1M tokens) | No index, just big prompts | Great reasoning within a small corpus | Impossible for millions of docs; cost/latency; no permission filtering; "lost in the middle" | Use *after* retrieval for deep reading of a few docs |
| **Hybrid retrieval + rerank** (BM25 + dense + learned sparse, RRF, cross-encoder) | Multiple signals fused | Big recall/precision gains; keyword search still wins on IDs, names, error codes | Still single-shot | **Core of the index** |
| **Contextual retrieval** | Prepend a short LLM-generated summary of the parent doc/section to every chunk before embedding & BM25 | Large reduction in retrieval failures at modest one-time cost (prompt caching makes it cheap) | Indexing cost | **Adopt** |
| **Late interaction** (ColBERT-style; ColPali/ColQwen for page images) | Token-level multi-vector matching; visual retrieval of slides/PDF pages | Best on tables, charts, scanned docs, slides | Storage-heavy | **Adopt for visual docs** (PDF, PPTX, scans) as a second index |
| **GraphRAG / knowledge graph** | Extract entities & relations; community summaries | Global questions ("main themes across all postmortems"), multi-hop | Expensive offline extraction; staleness | **Selective**: build an *enterprise graph* (people/docs/projects/activity) cheaply from metadata, use LLM extraction only for high-value corpora |
| **Agentic search** (LLM plans, issues many searches, reads, re-queries, verifies) | Retrieval as tools in a loop | 2026 benchmarks (e.g. RAGSearch, Apr 2026) show agentic search substantially improves dense RAG and closes most of the gap to GraphRAG; GraphRAG still helps on the hardest multi-hop | More LLM calls → needs routing/caching | **The architecture** |
| **Structured / text-to-SQL / tool retrieval** | Query Jira, Salesforce, warehouse via APIs/SQL | Exact answers for counts, filters, metrics | Needs schemas & guardrails | **Adopt** as tools (MCP) |
| **Memory** | Persistent per-user/team facts, preferences, procedures | Personalization (Glean's personal graph equivalent) | Privacy, drift | **Adopt with user-visible, editable memory** |

### 2.2 Recommendation: "Agentic Hybrid Retrieval" (AHR)

```
User query
  │
  ├─► Router (small model, ~50ms): intent = lookup | question | research | action | create-artifact
  │
  ├─► Fast path (≈70% of traffic): hybrid search → rerank → answer w/ citations (1 LLM call)
  │
  └─► Agent path: planner → parallel tool calls
          tools = search(index, filters) · visual_search(pages) · graph(who/what/related)
                  · read(doc, range) · sql/api(MCP connectors) · web · code_exec
                  · create_artifact(spec) · ask_user
        → evidence ledger (claims ↔ sources) → verifier (citation check) → answer / artifact
```

Key rules:
- **Permissions are enforced inside every tool**, never by the LLM.
- **Evidence ledger**: every claim in the final output must map to a stored source span; an
  automatic verifier rejects unsupported sentences (reduces hallucination, enables per-claim
  citation UI).
- **Escalation**: fast path → agent path automatically when confidence (retrieval score spread,
  answer self-check) is low.
- **Long context is used for reading, not for searching**: after retrieval, load full sections
  of the top 3–10 docs rather than tiny chunks.

---

## 3. Product features (full list, prioritized)

**P0 – MVP**
- Unified search with facets (source, type, owner, date, people) + AI answer card
- Assistant chat: modes *Auto / Quick / Deep Research / Agent*, per-claim citations, source
  previews with highlighted spans, follow-ups
- Artifacts canvas: Doc (DOCX/PDF), Slides (PPTX), Sheet (XLSX), HTML report; version history;
  "edit this slide/section" instructions
- Connectors (first 15): Google Drive, Gmail, Google Calendar, SharePoint/OneDrive, Outlook,
  Teams, Slack, Confluence, Jira, Notion, GitHub, GitLab, Salesforce, HubSpot, Zendesk, + file upload/web crawl
- Permission sync (doc-level ACL, group expansion) for all connectors — **free tier included**
- SSO (OIDC/SAML), RBAC (Admin / Curator / Member / Guest — this UI's admin/manager/member/client)
- Admin: connector health, index stats, model configuration, usage analytics
- Slack bot

**P1**
- Agent builder (prompt + knowledge scope + tools + triggers + approval steps), agent gallery
- MCP client (consume any MCP server) and MCP server (expose our search to Claude/other agents)
- Enterprise graph: people directory, expertise, "related", org-aware ranking
- Memory (user + team), visible and editable
- Deep research reports with outline approval → full report artifact
- Browser extension (search + sidebar answers on any page), Teams bot
- Knowledge-gap & content-health analytics (stale, duplicate, contradictory docs)
- Data analysis: upload CSV/XLSX or connect a warehouse → code sandbox → charts → XLSX/PPTX

**P2**
- Scheduled/autonomous agents (weekly status deck from Jira + Slack, renewal-risk sheet from CRM)
- Brand kits (template PPTX/DOCX, fonts, colors) and template library
- Round-trip editing of user-uploaded Office files (preserve styles, track changes)
- Voice / meeting ingestion (transcripts → action items)
- Multi-tenant SaaS with BYOK, data residency, customer-managed encryption keys
- Marketplace for agents & connectors

---

## 4. Artifacts engine (Claude-style, but Office-grade)

### 4.1 Principle: **LLM writes a typed spec; deterministic renderers write the file.**
Free-form LLM-generated Office XML is fragile. Instead:

```
prompt + evidence ─► LLM (structured output / tool call) ─► ArtifactSpec (JSON, zod/pydantic validated)
                                                            │
             ┌──────────────────────┬──────────────────────┼──────────────────────┐
             ▼                      ▼                      ▼                      ▼
      Deck renderer           Doc renderer          Sheet renderer          HTML/PDF renderer
   (PptxGenJS or python-     (docx (npm) or        (ExcelJS / openpyxl:    (React → HTML,
    pptx + brand template)    python-docx)          real formulas, styles,  Playwright → PDF)
                                                    charts, named ranges)
             └──────────────── preview in browser (render spec to React) ─────────────┘
```

- **Specs** (examples): `DeckSpec{theme, slides:[{layout:"title|bullets|chart|table|image|two-col|quote", ...}]}`,
  `DocSpec{sections, headings, tables, footnotes(citations)}`, `SheetSpec{sheets:[{columns, rows, formulas, charts}]}`.
- **Preview = same spec rendered in React** (instant, editable in place); the file is produced on
  export, so preview and download never diverge.
- **Edits are patches**: "make slide 3 a chart" → LLM emits a JSON Patch against the spec, not a full
  regeneration → faster, cheaper, keeps user edits.
- **Versioning**: every patch creates a version; diff view; restore.
- **Citations travel with the artifact**: footnotes in DOCX, speaker notes in PPTX, a "Sources" sheet in XLSX.
- **Visual QA loop**: render to PNG (LibreOffice headless / Playwright), let a vision model check for
  overflow/overlap, auto-fix before showing. This is what makes generated decks look professional.
- **Data artifacts**: numbers in sheets/charts come from a code sandbox (Python/pandas in gVisor/Firecracker),
  never from the LLM's memory.

### 4.2 Artifact types roadmap
Doc → Slides → Sheet → HTML dashboard → PDF → Diagram (Mermaid/Excalidraw) → Email draft → Code snippet.

---

## 5. Context management (how to behave like Claude, efficiently)

| Technique | What it does | Impact |
| --- | --- | --- |
| **Prompt caching** | Cache system prompt, tool definitions, agent instructions, long documents | 50–90% input-cost reduction on repeated prefixes |
| **Context budgeter** | Hard token budgets per slot (system, memory, history, evidence, tools); fills by priority | Predictable cost/latency |
| **Compaction** | When a conversation nears the budget, summarize older turns into a structured "state" (goals, decisions, open questions, artifact ids) | Unlimited-length sessions |
| **Tool-result clearing** | Old search results replaced by a short pointer (`[result #12: 8 docs, see ledger]`) | Keeps agent loops lean |
| **Artifacts by reference** | Artifacts live in a store; the model sees an outline + ids, loads sections on demand | Large docs without blowing context |
| **Sub-agents** | Deep research spawns workers with isolated contexts; each returns a compressed finding + citations | Parallelism and smaller contexts |
| **Memory tiers** | Session (working), user memory (preferences, role, projects), team memory (procedures, glossary), org graph | Personalization without re-reading history |
| **Just-in-time retrieval** | Model sees doc titles/metadata first, reads full content only when needed | Fewer wasted tokens |

---

## 6. System architecture

### 6.1 Services (lean by design)

```
                ┌──────────── Web app (this repo: TanStack Start + React 19) ────────────┐
                │ Assistant · Search · Artifacts canvas · Agents · Connectors · Admin     │
                └───────────────┬───────────────────────────────────────────────────────┘
                                │ HTTPS + SSE/WebSocket (token & step streaming)
┌───────────────────────────────▼────────────────────────────────────────────────────┐
│ API gateway (auth, SSO, RBAC, rate limits, audit)                                   │
├────────────────────────────────────────────────────────────────────────────────────┤
│ Orchestrator: router · agent runtime · context budgeter · evidence ledger · verifier│
│ Tools: search · visual_search · graph · read · MCP · web · code sandbox · artifacts │
├──────────────┬───────────────┬───────────────┬──────────────┬──────────────────────┤
│ Retrieval    │ Enterprise    │ Artifact      │ Model        │ Memory store         │
│ service      │ graph         │ service       │ gateway      │                      │
│ (hybrid+rer.)│ (people/docs/ │ (specs,       │ (routing,    │                      │
│              │  activity)    │  renderers)   │  cache, BYOK)│                      │
├──────────────┴───────────────┴───────────────┴──────────────┴──────────────────────┤
│ Ingestion: connectors (webhooks + incremental polling) → parse → chunk → enrich      │
│            → embed → index; permission sync workers; deletion propagation           │
├────────────────────────────────────────────────────────────────────────────────────┤
│ Storage: Postgres (metadata, ACL, graph tables, pgvector) · Search engine · Object  │
│          store (S3/MinIO: raw files, artifacts) · Queue (Postgres-based or NATS)     │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Ingestion pipeline
1. **Connectors**: webhook/event subscriptions where available (Slack Events, Graph change
   notifications, Drive push, Jira webhooks), cursor-based incremental polling otherwise; deletes
   and permission changes propagated within minutes. Target freshness: <5 min for event-driven sources.
2. **Parsing**: layout-aware parsing (Docling / Unstructured-class tools), table extraction, OCR for
   scans, slide/page images kept for visual retrieval, code-aware parsing for repos.
3. **Chunking**: structure-aware (headings, sections, table rows, thread messages) with parent-child
   links; chunks 300–800 tokens; parents ~2–4K for reading.
4. **Enrichment**: contextual header per chunk (doc title, path, section, 1-sentence context),
   language detection, PII tags, entities (people, customers, projects), dedupe (MinHash/SimHash),
   freshness/authority signals (views, edits, author seniority, verified badge).
5. **Indexing**: BM25 + dense + learned sparse; multi-vector page embeddings for visual docs; ACL
   tokens stored with every chunk (early-binding filter) + late check against source on open.

### 6.3 Ranking stack
`candidates = RRF(BM25, dense, sparse, visual)` → filter by ACL → **cross-encoder rerank** (top 100 → 20)
→ **personal/graph boosts** (my team, my projects, recency, authority, click feedback) → diversify (MMR).
Learn-to-rank weights from click/feedback data once there is traffic.

### 6.4 Enterprise graph (cheap first, rich later)
- Nodes: Person, Team, Document, Project, Customer, Channel, Ticket, Repo, Meeting.
- Edges from **metadata** (author, editor, mention, member-of, linked-ticket, attended) — zero LLM cost.
- LLM extraction only for high-value corpora (contracts, PRDs, postmortems) → entities + relations.
- Uses: expertise finder, "related", personal ranking, scoped agents, global-question summaries.
- Stored in Postgres tables (adjacency + recursive CTEs) first; dedicated graph DB only if needed.

### 6.5 Security & governance
- Permission enforcement in retrieval (never prompt-based); group expansion cached and synced.
- SSO (OIDC/SAML), SCIM provisioning, RBAC + per-agent scopes, audit log of every query, read and action.
- Prompt-injection defense for indexed content: content is data — tool outputs wrapped and labelled,
  actions with side effects require user approval, allow-listed tools per agent, egress controls.
- PII/secret redaction options, retention policies, legal hold, data residency, BYOK, customer-managed keys.
- Tenant isolation: separate schemas/indexes per tenant; encryption at rest + in transit.

### 6.6 Storage choices (efficiency decision)
| Scale | Recommended | Why |
| --- | --- | --- |
| ≤ 5M chunks (most SMB/mid-market, all self-host trials) | **Postgres + pgvector (HNSW/halfvec) + Postgres full-text/BM25 extension (e.g. ParadeDB pg_search)** | One database to operate; transactional ACL updates; cheap |
| 5M – 500M chunks | **Vespa** or **OpenSearch** (hybrid, filtering, multi-vector) | Proven at scale; Vespa handles hybrid + rerank + multi-vector natively (Onyx also uses it) |
| Visual index | Multi-vector store (Vespa tensors, or Qdrant multivector) | Late-interaction page retrieval |

Abstract this behind a `RetrievalBackend` interface so we can start small and migrate.

---

## 7. Models (route by task; everything swappable)

| Task | Hosted default | Self-host / air-gap option | Notes |
| --- | --- | --- | --- |
| Router, query rewrite, classification, chunk context | Claude Haiku 5.5 | Small open model (7–14B class, e.g. Qwen/Llama family) | Cheap & fast, most calls |
| Standard answers | Claude Sonnet 5.5 | 30–70B open model | Quality/cost sweet spot |
| Deep research planner, hard reasoning, artifact authoring | Claude Opus 5.5 (or Sonnet) | Largest available open reasoning model | Only for escalated tasks |
| Embeddings (text) | Voyage / Cohere embed class models | BGE-M3, Qwen3-Embedding, nomic-embed families | Benchmark on *your* data; support Matryoshka dims for cost |
| Learned sparse | — | SPLADE-family | Great on jargon & IDs |
| Reranker | Cohere Rerank / Voyage rerank | bge-reranker / Qwen3-Reranker families | Biggest single quality lever after hybrid |
| Visual retrieval | — | ColPali / ColQwen family | Slides, scanned PDFs, charts |
| OCR / layout | Vision LLM fallback | Docling/Tesseract/PaddleOCR | |
| Speech | Hosted STT | Whisper-family | Meetings |

Model gateway responsibilities: provider abstraction, routing policy, fallbacks, retries, prompt
caching, semantic cache for repeated questions (keyed by ACL group set!), per-tenant BYOK,
cost & token accounting, PII redaction.

> Always re-run the eval suite (section 9) before switching any model — public leaderboards don't
> predict performance on company data.

---

## 8. Performance & efficiency targets

| Metric | Target |
| --- | --- |
| Search results (keyword+hybrid, no LLM) | p50 < 150 ms, p95 < 400 ms |
| Quick answer first token | < 1.2 s |
| Quick answer complete | < 4 s |
| Deep research | 1–5 min, live progress streamed |
| Connector freshness (event-driven) | < 5 min |
| Permission change propagation | < 5 min |
| Cost / quick answer | ≤ $0.01 |
| Cost / deep research | ≤ $0.25 |
| Self-host footprint (≤1M docs) | 1 VM, 8 vCPU / 32 GB, no GPU required (hosted models) |

Levers: router to small models, prompt + semantic caching, streaming, parallel tool calls,
precomputed contextual chunk headers, quantized embeddings (int8/binary + rescoring),
incremental indexing, HTTP/2 SSE streaming of steps.

---

## 9. Evaluation & quality (how we prove we "beat them")

- **Golden sets per customer** (200–500 Q/A with source docs) bootstrapped by LLM from the corpus and
  validated by humans.
- **Retrieval metrics**: Recall@20, nDCG@10, MRR; **answer metrics**: faithfulness (claims supported),
  citation precision/recall, completeness, refusal correctness; LLM-as-judge calibrated against humans.
- **Online**: thumbs up/down with reason, citation clicks, copy/export of artifacts, "answer
  abandoned", time-to-answer; weekly regression dashboard (the *Insights* page).
- **Head-to-head bake-off kit**: same corpus, same questions vs Onyx (self-hosted) and Glean (trial),
  blind human grading — use it in sales.
- CI gate: no model/prompt/ranking change ships if the eval suite regresses.

---

## 10. Tech stack

| Layer | Choice | Reason |
| --- | --- | --- |
| Frontend | **This repo**: TanStack Start, React 19, Tailwind v4, shadcn/Radix, motion, recharts | Already built, SSR, typed routes, dark/light, responsive |
| Streaming | SSE for tokens + step events; WebSocket for collaborative artifact editing (Yjs) | |
| API & orchestrator | Python (FastAPI) **or** TypeScript (Hono/Node) — pick one; Python has richer parsing/ML/Office libs | Recommendation: Python services, TS frontend |
| Queue / jobs | Postgres-backed queue (e.g. Procrastinate/pg-boss) at small scale; NATS/Kafka at large scale | Fewer services than Celery+Redis |
| DB | Postgres 16+ (pgvector, BM25 extension) | |
| Search at scale | Vespa | |
| Object store | S3 / MinIO | |
| Sandbox | gVisor or Firecracker microVMs | Safe code execution for data artifacts |
| Office rendering | python-pptx / PptxGenJS, python-docx / docx, openpyxl / ExcelJS, LibreOffice headless for PNG previews | |
| Auth | OIDC/SAML (e.g. Keycloak/WorkOS/Auth.js), SCIM | |
| Observability | OpenTelemetry traces per agent step, Langfuse-style LLM tracing, Prometheus/Grafana | |
| Deploy | Docker Compose (single node), Helm chart, Terraform modules | |

---

## 11. UI plan (implemented in this repo)

The original project-tracker kit was converted into the product shell (same design system, dark/light,
motion, responsive, role-based guards):

| Route | Purpose | Status |
| --- | --- | --- |
| `/assistant` | Chat with modes (Auto / Quick / Deep Research / Agent), source scope chips, step timeline, per-claim citations, source cards, **artifact canvas** (Doc / Slides / Sheet previews with export buttons) | Prototype with mock streaming |
| `/search` | Search results with facets, AI answer card, people results | Prototype |
| `/connectors` | Connector catalogue, sync health, docs indexed, permission-sync status; admin-only management | Prototype |
| `/agents` | Agent gallery, triggers, tools, run stats; builder entry point | Prototype |
| `/artifacts` | Library of generated files with type filters, versions, sources | Prototype |
| `/insights` | Admin analytics: queries, answer rate, cost, latency, knowledge gaps | Prototype |
| `/dashboard`, `/projects`, `/tasks` | Legacy tracker pages kept (not in nav) as reference components | Legacy |

Roles mapping: `admin` = Admin, `manager` = Curator (manages connectors' scopes/agents, sees insights),
`member` = Member, `client` = Guest (assistant + search on shared spaces only).

Next UI steps: wire to real API (TanStack Query + SSE), source preview drawer with highlight,
artifact editing (inline + instruction), version history, agent builder form, admin settings for
models/SSO, keyboard-first command palette (`cmdk` is already installed).

---

## 12. Roadmap

| Phase | Duration | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| **0. Foundations** | Weeks 1–4 | Monorepo, auth/RBAC, Postgres schema, model gateway, eval harness, UI shell (done) | Login → chat with uploaded files, cited answers |
| **1. MVP** | Weeks 5–14 | 15 connectors + permission sync, hybrid index + rerank + contextual chunks, Quick & Auto modes, Doc + Slides + Sheet artifacts, search page, Slack bot, admin connectors/analytics | 3 design partners; beats Onyx on their golden set |
| **2. Differentiate** | Weeks 15–26 | Agentic deep research, evidence ledger + verifier, enterprise graph v1, agent builder, MCP client+server, memory, browser extension, visual retrieval, knowledge-gap analytics | Win blind bake-off vs Glean on ≥2 customers |
| **3. Enterprise scale** | Weeks 27–40 | Vespa backend, scheduled agents, brand kits, Office round-trip editing, SOC 2 Type II, data residency, BYOK, Helm/Terraform, marketplace | 1M+ docs tenants, p95 targets met |

Team (minimum): 2 backend/infra, 1 search/ML, 1 connectors, 2 frontend, 1 design, 1 PM/founder,
security advisor part-time.

---

## 13. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Connector breadth (Glean has 100+) | Prioritize top 15 by customer demand; MCP client lets customers plug in anything; generic REST/SQL connector |
| Permission leaks | Retrieval-layer enforcement, late re-check on open, nightly ACL audits, red-team tests in CI |
| Hallucinated numbers in artifacts | Numbers only from sandbox/tool outputs; verifier; citations in artifacts |
| LLM cost spikes | Router, budgets per tenant, caching, small-model defaults |
| Prompt injection via indexed docs | Content-as-data wrapping, approvals for side-effect actions, tool allow-lists |
| Model churn | Gateway abstraction + eval CI gate |
| Self-host support burden | Single-node default, health dashboard, one-command upgrade, telemetry opt-in |

---

## 14. Sources

- Onyx overview & features: [Elest.io review](https://blog.elest.io/onyx-free-open-source-ai-platform-with-connectors-agents-knowledge-base/),
  [Onyx — Glean alternatives](https://onyx.app/insights/glean-alternatives),
  [rfp.wiki Onyx review](https://www.rfp.wiki/vendors/onyx),
  [Cloud-native landscape entry](https://landscape.jimmysong.io/projects/onyx/)
- Glean: [Third-gen assistant & Enterprise Graph (press)](https://www.glean.com/press/glean-introduces-third-generation-ai-assistant-new-enterprise-graph-to-enable-the-superintelligent-enterprise),
  [Enterprise Graph & personalization](https://www.glean.com/press/glean-introduces-enterprise-graph-new-personalization-features-for-ai-assistant),
  [Reworked on Agentic Engine 2.0](https://www.reworked.co/knowledge-findability/glean-thinks-its-ai-understands-your-company-better-than-you-do/),
  [Techstrong: graphs & MCP servers](https://techstrong.ai/features/glean-adds-additional-graphs-and-mcp-servers-to-ai-workflow-platform/),
  [BusinessWire Sept 2025](https://www.businesswire.com/news/home/20250925784461/en),
  [Futurum analysis 2026](https://futurumgroup.com/?p=88444)
- Retrieval research: [Do We Still Need GraphRAG? (RAGSearch, 2026)](https://www.alphaxiv.org/abs/2604.09666),
  [Comparative RAG paradigms on semi-structured KBs (2026)](https://arxiv.org/abs/2606.25656),
  [Unique.ai graph-based RAG research notes](https://docs.unique.ai/administrators/research/rag-evaluations/graph-based-rag-research)
- Vendor claims above are from vendor/third-party pages; verify against current docs before
  publishing competitive material.
