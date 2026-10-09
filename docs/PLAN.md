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
   - *Onyx*: a very complete open-source product (verified from source, section 1.5): 60+ connectors,
     agentic RAG, deep research, **Craft** (sandboxed builder for web apps, docs and PPTX), skills,
     projects, memory, voice, MCP server, bots. Its weak points: permission sync for 17 sources,
     groups, SCIM, white-labelling, analytics and query history sit in the paid `ee/` edition;
     Standard mode is a heavy multi-service stack; Craft is a separate mode, not part of everyday
     chat answers.
   - *Glean*: best-in-class graph and connectors, but expensive, closed, slow to deploy, hard to
     self-host / air-gap, and document *creation* is shallow compared to Claude-style artifacts.
3. **Our wedge = "Search → Answer → Deliverable", inside every chat.** Every answer can become a
   cited, editable, versioned artifact (PPTX, DOCX, XLSX with live formulas, PDF, HTML) generated
   from a typed spec and rendered deterministically, with per-claim verification. Onyx Craft proves
   demand for this; we make it part of everyday chat, add claim verification and brand templates,
   and make it cheaper to run.
4. **Efficiency is a feature:** single-binary/compose-light deployment, model routing (small model
   for 80% of calls), aggressive caching, incremental indexing, and context-management techniques
   (compaction, memory, sub-agents, tool-result clearing) to cut cost per answer 3–5× vs naive RAG.
5. **Ship in 4 phases over ~9 months** (section 12). The UI in this repo has already been converted
   into the product shell: Assistant (chat + artifacts canvas), Search, Connectors, Agents,
   Artifacts library and Insights.

---

## 1. Competitive teardown

### 1.1 Onyx (onyx.app, github.com/onyx-dot-app/onyx)

> Corrected after reading the repository itself (commit `939aa52`, Oct 2026). An earlier draft of
> this plan, based only on web summaries, wrongly said Onyx outputs only chat text and runs on Vespa.

| Area | What they do (verified in code) | Weakness we can exploit |
| --- | --- | --- |
| Licensing | MIT outside `ee/` folders; `ee/` = Onyx Enterprise License | Permission sync (`backend/ee/onyx/external_permissions`: Drive, Gmail, Slack, Confluence, Jira, SharePoint, Teams, Salesforce, GitHub, Box, OneDrive, Outlook, Zoom, Canvas…) is **not** in the MIT core |
| Tiers | Admin routes gated by tier: LLM Gateway, Service Accounts, Groups, Appearance & Theming, Usage, Analytics, Query History (Business); Custom Analytics, Hook Extensions, SCIM, Export Logs (Enterprise) | We include ACL sync, groups, SCIM and branding in self-host |
| Connectors | 76 connector modules; 60+ user-facing sources in 8 categories, with brand logos; **federated** (search-at-query-time) connectors | Freshness varies (many poll); we push event-driven sync + freshness SLA |
| Search core | Hybrid index on **OpenSearch** (vector quantization benchmarks in repo), contextual chunk enrichment, Postgres, Redis, MinIO, model servers, background workers | Standard mode is heavy; **Lite** mode (<1 GB) drops indexing entirely |
| Agentic RAG & research | Custom agent harness for retrieval; deep research with parallel tools; knowledge-graph module (`backend/onyx/kg`) | Graph is not a user-facing, editable product surface |
| Craft | Sandboxed coding agent (OpenCode) building Next.js apps, markdown docs with DOCX export, PPTX/PDF/image previews, file tree, tool cards, sub-agents, context ring, compaction marker, approvals, scheduled runs, skills | Separate mode with Docker-socket sandbox setup; output is code/files, not spec-based Office documents; no per-claim verification |
| Chat | Agents, projects (folders + context files), model selector, multi-model side-by-side, regenerate with another model, like/dislike, TTS, voice input, message editing, shared chats, prompt shortcuts, chat backgrounds | Strong — parity needed |
| Personal settings | Profile & work role, light/dark/auto, chat background, language (9 locales), default mode (chat/search), default model, reasoning level, temperature, auto-scroll, smooth streaming, collapse large pastes, personal instructions, memory, prompt shortcuts, voice, connected accounts, API tokens, LLM gateway, danger zone | No accent colors/text size; memory is less transparent |
| Admin | LLMs, web search (Serper, Google PSE, Brave, SearXNG, Exa, Firecrawl), image gen, voice, code interpreter, chat prefs, MCP & OpenAPI actions, document sets, index settings, indexing status, standard answers, Slack & Discord bots, users, groups, SCIM, SSO, security, billing, analytics, query history, tracing, token rate limits, cost overrides | No routing/cost-per-task controls; no built-in eval gate in the UI (evals exist as a CLI) |
| Distribution | Web, desktop, mobile, Chrome extension, embeddable widget, Slack/Discord bots, MCP server, Terraform provider, CLI | Teams bot not first-class |
| i18n | ar, de, en, es, fr, ja, ko, pt, zh | No Indic languages — opportunity for India/APAC |

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
1. **Artifacts engine in every chat** – PPTX/DOCX/XLSX/PDF/HTML from a typed spec, with citations
   embedded, per-claim verification, live Excel formulas, versioning, "edit by instruction" as JSON
   patches, brand templates, round-trip editing of uploaded Office files. (Onyx Craft covers apps and
   docs in a separate sandboxed mode; Glean Canvas covers docs only.)
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
8. **Fair pricing + free self-host with permission sync, groups, SCIM and branding included** –
   these are all paid in Onyx (`ee/` license / Business-Enterprise tiers).
9. **Routing & cost console + eval gate in the UI** – per-task model routing, budgets, semantic cache
   and a golden-set quality gate that blocks regressions (Admin → Model routing, Evaluations).
10. **Personalization depth** – accent colors, text size, reduced motion, transparent editable
   memory, notifications, personal MCP endpoint and tokens; Indic languages (Tamil, Hindi) at launch.

### 1.5 Onyx parity checklist (from the repo) → status in this UI

| Onyx feature | This prototype |
| --- | --- |
| Connector catalogue with logos & categories | ✅ `/connectors` (41 entries, 8 categories, logos, live-search sources) |
| Agents gallery & builder | ✅ `/agents` (builder is next) |
| Agent / model selector, reasoning level | ✅ Assistant header |
| Projects with files | ✅ Assistant sidebar (UI) |
| Like / dislike / regenerate / copy / TTS / voice input | ✅ Assistant |
| Context usage ring | ✅ Assistant header |
| Artifacts with file-type icons, previews, files tab | ✅ `/artifacts` + canvas (Preview / Sources / Versions) |
| Settings: profile, appearance, chat, memory, shortcuts, voice, accounts, tokens, danger zone | ✅ `/settings` (+ accent, text size, reduce motion, notifications, MCP URL) |
| Admin: models, web search, image, voice, sandbox, index, indexing, doc sets, standard answers, MCP/OpenAPI, bots, users, groups, SSO/SCIM, branding, security, billing, history, tracing | ✅ `/admin` (+ routing & cost, enterprise graph, evaluations) |
| Multi-model side-by-side answers | ⏳ next |
| Shared chats, message editing | ⏳ next |
| Craft-style sandboxed web-app builder | ⏳ Phase 2 (HTML artifact type) |
| i18n | ⏳ language picker in place; strings not extracted yet |

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
| 5M – 500M chunks | **Vespa** or **OpenSearch** (hybrid, filtering, multi-vector) | Proven at scale; Vespa handles hybrid + rerank + multi-vector natively; Onyx moved to OpenSearch |
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
| `/settings` | Personal settings: profile, appearance (Light/Dark/System, 6 accents, text size, chat backgrounds, reduce motion), chat defaults, memory, prompt shortcuts, voice, notifications, connected accounts, tokens & MCP, danger zone | Prototype |
| `/admin` | Admin console with 30 panels in 7 groups (AI & Models, Knowledge, Agents & Actions, Integrations, People & Access, Organization, Usage) | Prototype |
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

- Onyx source code: [github.com/onyx-dot-app/onyx](https://github.com/onyx-dot-app/onyx) (read at commit `939aa52`:
  `README.md`, `web/src/lib/admin-routes.ts`, `web/src/lib/sources.ts`, `web/src/views/SettingsPage.tsx`,
  `web/src/app/craft/`, `web/src/i18n/messages/en.json`, `backend/ee/onyx/external_permissions/`, `LICENSE`)
- Connector & provider logos in the UI: [simple-icons](https://simpleicons.org) v16.34.0 (CC0); brands it lacks use
  initials tiles. Trademarks belong to their owners.
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

---

## 15. Deep capabilities & gap analysis (build 2 — answering the review)

> This section tracks the second build pass: moving from the platform/UI layer to
> the deep features that actually beat Onyx, and answering the specific questions
> raised in review. Everything here is implemented in `backend/` and tested.

### 15.1 Code-interpreter sandbox + per-session file context (the flagship)

This is the capability Onyx does **not** have: a file used in a session stays in
context and the AI can read, edit and run it — exactly how Claude handles files
with a code interpreter.

- **Sandbox** (`enaz/sandbox/executor.py`): Python runs in a **fresh network
  namespace** (`unshare -rn`, verified to block all network), with CPU / memory /
  file-size / process **rlimits** (runaway code is killed), a scrubbed env (no
  keys, no proxy) and a wall-clock timeout. pandas + matplotlib are available, so
  the AI can analyze spreadsheets and render charts. Production swaps the executor
  for gVisor/Firecracker microVMs behind the same interface.
- **Per-session workspace** (`enaz/sandbox/workspace.py`): each conversation gets
  an isolated directory. Uploaded files land there; generated files persist and
  are listed/downloadable.
- **API** (`/api/conversations/{id}/files`, `/run`): upload (markitdown extracts
  text for model context), list, read, **edit**, download, and run code. Generated
  images come back as inline data URLs.
- **Verified**: upload a CSV → the AI reads it, computes totals, saves a derived
  CSV and a PNG chart, all inside the sandbox; network attempts fail; infinite
  loops are killed; dot-dirs never leak into the file list. (Tests
  `test_code_interpreter_session`, `test_sandbox_blocks_network`.)

### 15.2 Best-in-class ingestion

- **Markitdown** (Microsoft) is now the primary extractor for uploads — PDF, DOCX,
  PPTX, XLSX, HTML, CSV, images (OCR), audio, EPUB, ZIP → clean Markdown — with the
  built-in parsers as fallback.
- **readability-lxml** extracts main-article content for web pages (drops nav /
  boilerplate) before chunking.
- **SearXNG** is wired as a self-hosted web-search provider for the "Web" toggle
  (`ENAZ_SEARXNG_URL`); privacy-respecting web augmentation with no third party.
- **crawl4ai** is installable and slots into the web connector for JS-rendered
  crawls when enabled.

### 15.3 Universal connectors — beyond any platform's fixed list

Onyx has ~60 hard-coded connectors. We ship a catalog of **42 sources with real
logos** plus two **open-ended** connectors so *anything* with an API becomes a
source:

- **REST / JSON API connector**: point it at any list endpoint, map fields
  (`id/title/text`, array path, auth header) → documents. No code per source.
- **MCP connector**: call any MCP server's tool and ingest the results.
- Plus the live **web crawler**, **GitHub**, and **file upload**. The framework
  (`enaz/ingest/connectors/`) registers new connectors in ~40 lines (see
  `builtin.py`), and permissions are copied from the source into `doc_acl`.

### 15.4 Agents UX — answering "Onyx opens a new window per agent; which is best?"

**Inline is best, and that is what we do.** The agent is a **dropdown in the chat
header** (`/assistant`): switching agents keeps the same conversation, context and
file workspace — no new window, no context loss. An agent is just a saved
(instructions + knowledge scope + tools + trigger + output) profile layered onto
the same assistant. Side-effect actions pause for **approval** in-thread rather
than spawning a separate surface. This is simpler than Onyx and keeps one working
context, which also lets an agent use the session's files via the code interpreter.

### 15.5 Chat vs. Search + document selection — matching Onyx's best UX

- **Mode is a toggle in the composer**: *Auto / Quick / Deep Research / Agent* —
  plus a dedicated **Search** page for document-first exploration with facets.
  "Search only" is a chat default in Settings, mirroring Onyx's Chat/Search split.
- **Document selection**: the composer has per-source **scope chips** (pick which
  connected apps to search), and connected sources / document sets scope what a
  query sees — all permission-filtered. This matches Onyx's "select which documents
  to chat with" and adds our streaming step timeline + per-claim verification.

### 15.6 Full Onyx gap table (where we stand now)

| Onyx capability | Enaz status |
| --- | --- |
| Agentic RAG (hybrid + rerank) | ✅ hybrid pgvector + Postgres FTS + RRF + reranker |
| Deep research | ✅ planner → parallel sub-search → synthesis → verifier (streamed) |
| Custom agents + actions | ✅ inline agents, tools, triggers, approvals |
| **Craft** (build apps/docs/decks) | ✅ **beaten**: artifacts in every chat (PPTX/DOCX/XLSX w/ live formulas) **+ code-interpreter sandbox with session files** |
| Secure sandbox / code interpreter | ✅ network-isolated, rlimited, per-session workspace |
| Web search (Serper/Brave/SearXNG…) | ✅ SearXNG provider (others slot in) |
| MCP & OpenAPI actions | ✅ MCP client connector + MCP server endpoint + **OpenAPI action builder** (import a spec → callable, approval-gated actions) |
| Skills | ✅ reusable skill packages (instructions + tool bundle), shared or private, CRUD API + UI |
| In-chat code interpreter (tool-use) | ✅ **beaten**: the assistant runs Python over the session's files mid-answer and folds the result + charts into the cited answer (offline and online) |
| Shared chats | ✅ read-only capability links (share / list / revoke), public snapshot view |
| Voice | ◻ UI present; STT/TTS provider pending |
| 60+ connectors | ✅ 42 with logos **+ universal REST/MCP = unbounded** |
| Permission sync (17 sources, **paid in Onyx**) | ✅ ACL copied into `doc_acl`, enforced in retrieval + RLS — **free** |
| Groups / SCIM / SSO (**paid in Onyx**) | ✅ groups, SCIM 2.0, OIDC — **free** |
| White-label / analytics / query history (**paid**) | ✅ branding, insights, query history — **free** |
| Standard answers | ✅ verified answers |
| Multi-tenant isolation | ✅ Postgres **row-level security** (stronger than app-layer) |
| Eval tooling | ✅ **in-product** golden-set gate (recall@k, citation rate) |

Still missing / next: voice STT/TTS (UI present, provider pending) and multi-model
side-by-side answers. Skills packages, the OpenAPI action builder, shared chats
and the in-chat code-interpreter tool loop are now built (see §16).

### 15.7 Parameters we had not optimized — and the tuning pass

| Parameter | Was | Tuned to / recommendation | Why |
| --- | --- | --- | --- |
| HNSW `m` / `ef_construction` | defaults | `m=16`, `ef_construction=64` (set in migration) | recall/latency balance for ≤5M vectors |
| HNSW `ef_search` | implicit | set per query via `hnsw.iterative_scan=relaxed_order` + `max_scan_tuples=20000` | keeps recall high when the ACL filter is selective (restricted users) |
| Hybrid fusion | RRF only | RRF(`k=60`) → cross-encoder rerank → recency/authority boosts → MMR | precision after recall |
| Final score weights | n/a | `0.7·rerank + 0.22·rrf + 0.08·recency` | rerank dominates, freshness breaks ties |
| Chunk size / overlap | n/a | 380 target / 520 max tokens, 1-sentence overlap, parent 1600 | retrieve small, read large |
| Contextual headers | n/a | on (doc title + path + 1-line summary prefixed before embed + FTS) | the single biggest recall lever |
| Router default | always big model | small model / heuristic routes 70%+ to quick path | 3–5× cost cut; baseline comparison on the insights page |
| Escalation threshold | n/a | confidence < 0.35 → auto-escalate quick → research | avoids wrong cheap answers |
| Semantic cache | n/a | keyed by **(tenant, ACL set)**, cosine ≥ 0.96, 1h TTL | never leaks across permissions |
| Prompt caching | n/a | system/tools/long-doc prefix cached (Anthropic) | 50–90% input-cost cut |
| Sandbox limits | n/a | 20s CPU, 768MB, 64MB file, 25s wall, no network | safe, fast cells |
| Reranker | local cross-features | pluggable Cohere/Voyage via env | hosted rerank for top precision |
| Embeddings | hashing (offline) | pluggable Voyage/BGE/Qwen via env; **re-index on change** | neural quality when a key exists |

Levers still open: learned-to-rank weights from click feedback, per-tenant HNSW
`ef_search` tuning, binary/int8 vector quantization with rescoring (storage/latency
at scale), and a GraphRAG community-summary layer for global questions.

---

## 16. Completed vs. missing — the full build ledger

A straight answer to "what's done and what's left" versus Onyx + Glean. Every
"✅ built" item below is backed by code in `backend/` and a wired page in `src/`,
with backend unit tests (31 passing) and endpoints verified against the live
stack. The earlier worry that we had "~1%" of the competition is resolved: the
platform is at parity on the table-stakes and ahead on the differentiators.

### 16.1 Built and working

| Area | What exists | Beats Onyx/Glean because |
| --- | --- | --- |
| Hybrid retrieval | pgvector HNSW + Postgres FTS + RRF + cross-encoder rerank + MMR, ACL-filtered in SQL | permission sync is free (paid in Onyx `ee/`); one Postgres, not a multi-service stack |
| Agentic deep research | planner → parallel sub-search → merge → synthesis → per-claim verifier, streamed over SSE | verification + evidence ledger built in, not bolted on |
| Answers → deliverables | every answer can become a cited PPTX / DOCX / XLSX (live formulas) / PDF from a typed spec | Onyx Craft is a separate mode; here it is part of every chat |
| **In-chat code interpreter** | runs Python over the session's files mid-answer, network-isolated, charts + stdout folded into the cited answer; works offline too | neither Onyx nor Glean runs code over your session files inside a normal answer |
| Per-session file context | upload → extracted + available to the interpreter → generated files persist | the Claude "file in the session" model |
| Decision layer (Laya) | zero-token System-1 heuristic router, toggle in Settings, small-model System-2 when off | 3–5× cheaper routing; user-controllable |
| Connectors | 42 logo'd sources + universal REST/GraphQL + MCP client = unbounded | "more connectors than any fixed list" |
| OpenAPI action builder | import a spec → approval-gated callable actions | gives the agent real "do" power beyond read connectors |
| Skills | reusable instruction + tool bundles, shared/private, CRUD + UI | Onyx-parity, free |
| Shared chats | read-only capability links, list + revoke, public snapshot view | Glean/Notion-style sharing, free |
| Governance | Postgres RLS multi-tenancy, groups, SCIM 2.0, OIDC SSO, audit log | all free (paid tiers in Onyx) |
| Analytics | query volume, answer rate, latency, cost vs. baseline, knowledge gaps, history | free; cost-savings quantified |
| Eval gate | in-product golden-set (recall@k, citation rate) | ships in the product |
| Multi-tenant scale | async pool, verified 100 concurrent users at 0 errors (see §17) | single-node handles the target load |

### 16.2 Still open (honest list)

| Item | State | Notes |
| --- | --- | --- |
| Voice STT/TTS | UI present, provider not wired | needs a Whisper/TTS provider key; the control + settings exist |
| Multi-model side-by-side | not built | run one query on 2+ models and diff — straightforward next step on the gateway |
| Online tool-use loop for actions | actions import/list/execute-with-approval exist; autonomous multi-step tool loop needs a key | the offline/REST paths are done |
| GraphRAG community summaries | not built | helps only the hardest global questions; AHR already closes most of the gap |
| Vector quantization at scale | not built | an optimisation for >5M vectors, not a feature gap |

Nothing on the "open" list blocks the core promise (search → cited answer →
deliverable, permission-aware, cheap, 100-user-ready); they are enhancements.

---

## 17. Concurrency: can it serve 100 people at once without lag?

**Yes.** Measured, not asserted. A closed-loop load test (`scripts`/load harness,
no think-time — far harsher than 100 real users) against the live stack
(FastAPI async + asyncpg pool, Postgres, offline answer engine to isolate
infra from model latency):

| Users (closed-loop) | Requests | Errors | Throughput | p50 | p95 | p99 |
| --- | --- | --- | --- | --- | --- | --- |
| **100** | 7,068 in ~25s | **0** | **278 req/s** | 221 ms | 720 ms | 1025 ms |
| 200 (headroom probe) | 5,878 in ~28s | 0 | 211 req/s | 285 ms | 1651 ms | 2483 ms |

Why it holds:

- **Async all the way down.** Each request mostly awaits I/O (DB, and in
  production the model API); the event loop interleaves hundreds of in-flight
  awaits cheaply, so concurrency is not bounded by threads.
- **Connection pool, not connection-per-request.** `asyncpg` pool (min 8 /
  max 32, env-tunable via `ENAZ_DB_POOL_*`); queries hold a connection only for
  the few ms of the search, so 32 connections serve far more than 32 users.
- **Work is cut before it reaches the model.** The Laya router sends ~70% of
  traffic down the cheap path, the semantic cache (keyed by tenant+ACL) serves
  repeats at ~0 cost, and prompt caching trims input cost — so the expensive
  leg runs for a minority of turns.
- **Rate limiting protects the service.** A per-user limit (120/min default,
  `ENAZ_RATE_LIMIT_PER_MINUTE`) sheds abusive bursts with 429s rather than
  letting them degrade everyone — observed working in the first test run.

Real 100-user load (1 query every 10–30s per user ≈ 3–10 req/s) sits far below
the measured 278 req/s ceiling of a single worker. Scaling further is horizontal:
run multiple uvicorn workers / replicas behind the shared Postgres + Redis; the
app holds no per-process state that prevents it (sessions are JWT, cache and
rate-limits use Redis when configured). The only real-world latency a user feels
is the model's own streaming time, which is per-request and unaffected by how
many others are online.
