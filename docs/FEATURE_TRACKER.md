# Enaz Knowledge — Feature Tracker

> Living checklist of every planned feature and its completion stage. Companion to
> [`PLAN.md`](./PLAN.md) (the product/architecture rationale). This file is the
> single source of truth for **what's done and what's pending**.
>
> **Legend:** ✅ Done & tested · 🟡 Partial / in progress · ⬜ Not started
>
> Backend tests: **51 passing** (`backend/tests`). Frontend: `npm run build` +
> `tsc --noEmit` clean. Branch: `ccr-66169f4a-82b1dj`. Last updated: 2026-10-10.

---

## Legend of surfaces

Each item notes where it lives: **BE** = backend (`backend/enaz`), **FE** =
frontend (`src/`), **DB** = migration (`backend/alembic/versions`), **T** = test.

---

## 1. Core platform (foundations → differentiators)

| # | Feature | Status | Where |
| --- | --- | --- | --- |
| 1.1 | Postgres + pgvector foundation: async pool, Alembic migrations, RLS multi-tenancy, auth/RBAC/groups | ✅ | BE, DB, T |
| 1.2 | Ingestion: parsers, chunking, contextual headers, connectors with ACLs | ✅ | BE, T |
| 1.3 | Hybrid retrieval: BM25 + vectors + RRF + cross-encoder rerank + MMR, ACL-filtered in SQL | ✅ | BE, T |
| 1.4 | Decision layer (Laya System-1 router) + LLM gateway with caching + cost accounting | ✅ | BE, FE, T |
| 1.5 | Answer pipeline: evidence ledger, per-claim verifier, deep research, SSE streaming | ✅ | BE, FE, T |
| 1.6 | Artifacts engine: Deck/Doc/Sheet typed specs, OOXML renderers, versions, patches | ✅ | BE, FE, T |
| 1.7 | In-chat code interpreter: Python over session files, network-isolated, folded into cited answer | ✅ | BE, FE, T |
| 1.8 | Per-session file workspace: upload → extract → interpreter → generated files persist | ✅ | BE, FE, T |
| 1.9 | Universal connectors: 42 logo'd sources + generic REST/GraphQL + MCP client | ✅ | BE, FE, T |
| 1.10 | Connector engine: credentials, index-attempts, scheduling, pause/resume, document sets | ✅ | BE, FE, T |
| 1.11 | Background scheduler for automatic periodic indexing (refresh frequency) | ✅ | BE, T |
| 1.12 | OpenAPI action builder: import spec → approval-gated callable actions | ✅ | BE, FE |
| 1.13 | Skills (reusable instruction + tool bundles), shortcuts | ✅ | BE, FE |
| 1.14 | Shared chats: read-only capability links, list + revoke | ✅ | BE, FE |
| 1.15 | Governance: RLS multi-tenancy, groups, SCIM 2.0, OIDC SSO, audit log | ✅ | BE, FE, T |
| 1.16 | Analytics/insights: query volume, answer rate, latency, cost vs baseline, knowledge gaps, history | ✅ | BE, FE |
| 1.17 | Eval gate: in-product golden-set (recall@k, citation rate) | ✅ | BE, FE |
| 1.18 | 100-concurrent-user load test + pool tuning + analysis | ✅ | BE |
| 1.19 | Multi-model side-by-side compare | ✅ | BE, FE |

---

## 2. Self-owned coworker platform (PLAN §20.6, Option 1 — no third-party runtime)

| # | Feature | Status | Where |
| --- | --- | --- | --- |
| C1 | Durable run engine: `agent_jobs` + run-state machine, worker loop (SKIP LOCKED + leases), survives chat close / worker restart | ✅ | BE, T |
| C2 | Own typed event protocol: run lifecycle / text / tool.call / tool.result / state / error / interrupt over SSE | ✅ | BE, FE, T |
| C3 | Tool execution loop: policy-filtered registry, receipts per call, side-effect tools park at approval, read tools inline | ✅ | BE, T |
| C4 | Checkpoints & resume: completed steps persisted, resume reconciles receipts, interrupted runs not auto-replayed | ✅ | BE, T |
| C5 | Task workspace: runs linked to a conversation workspace (uploads, artifacts, receipts in one place) | ✅ | BE, FE |
| C6 | Scoped agent memory: personal / agent / shared visibility, user-visible/editable/deletable, deletion affects later runs | ✅ | BE, FE, T |
| C7 | **Agent schedules**: recurring agent runs (cron + timezone, concurrency limit, budget, accountable initiating user, leases) | ⬜ | — |
| C8 | **Budgets & cost ledger**: per-run / per-schedule budget enforced in the gateway, run stops when exceeded | 🟡 | BE (budget param accepted; hard enforcement + per-schedule pending) |

### Coworker build stages (PLAN §20.4)

| Stage | Deliverable | Status |
| --- | --- | --- |
| 1 | Agent correctness — saved instructions, source restrictions, enabled status, tool policy enforced in the runner | ✅ |
| 2 | Interactive execution — event adapter, live activity, approval UI, real tool execution (edit/approve/deny) | ✅ |
| 3 | Durable work — worker queue, run states, checkpoints, cancellation, receipts, restart recovery | ✅ |
| 4 | Workspace & memory — task-linked files/artifacts, scoped memory, inspect/edit/delete | ✅ |
| 5 | **Agent computers** — optional isolated browser/files/terminal, per-agent permissions, human takeover (off by default) | ⬜ |
| 6 | **Scheduled work** — recurrence, budgets, leases, initiating-user checks | ⬜ |
| 7 | **Channels & handoffs** — optional voice/messaging; specialist coordination (bounded handoffs) | 🟡 (hand-offs via task rooms; voice/messaging channels pending) |

---

## 3. Releases A–D (shipped increments)

### Release A — supervise AI work
| # | Feature | Status | Where |
| --- | --- | --- | --- |
| A1 | Answer-correction workflow: submit/review, approved corrections injected as authoritative | ✅ | BE, FE, T |
| A2 | Universal work inbox: approvals + runs + corrections in one triage view | ✅ | BE, FE, T |
| A3 | Agent test mode (dry-run): sources, proposed tools/changes, estimated cost — no side effects | ✅ | BE, FE, T |
| A4 | Durable runs UI with inline Approve / Edit / Deny | ✅ | FE |

### Release B — live business data
| # | Feature | Status | Where |
| --- | --- | --- | --- |
| B1 | Live sources (read-only SQL / REST), `_validate_sql` rejects non-SELECT, READ ONLY txn + timeout + row cap | ✅ | BE, T |
| B2 | Live data folded into answers as checked-just-now authoritative evidence | ✅ | BE, FE, T |
| B3 | Live-sources admin UI | ✅ | FE |

### Release C — organizational discovery
| # | Feature | Status | Where |
| --- | --- | --- | --- |
| C-1 | Entity pages (`/api/entities/page`) | ✅ | BE, T |
| C-2 | Timeline (`/api/timeline`) | ✅ | BE, T |
| C-3 | Expert handoff (`/api/experts`) | ✅ | BE, T |

### Release D — collaboration, catalog, reach
| # | Feature | Status | Where |
| --- | --- | --- | --- |
| D1 | Agent catalog + publishing: discoverable published agents (owner, required access, tools, success rate, est cost/run) | ✅ | BE, FE, T |
| D2 | Shared task rooms: membership-gated comments / decisions / hand-offs, member mgmt, resolve/reopen | ✅ | BE, FE, DB, T |
| D3 | Browser side-panel answer endpoint: answers over provided page + related internal knowledge | ✅ | BE, T |
| D4 | Multilingual `answerLanguage`: faithful-translation directive threaded into synthesis | ✅ | BE, FE, T |

### Release E — proactive knowledge
| # | Feature | Status | Where |
| --- | --- | --- | --- |
| E1 | Knowledge alerts (saved searches with change detection): new/changed docs vs snapshot, permission-aware | ✅ | BE, FE, DB, T |

---

## 4. Open / pending (PLAN §16.2 + roadmap)

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| O1 | Voice STT/TTS | 🟡 | UI + settings present; provider (Whisper/TTS) not wired |
| O2 | Online autonomous multi-step tool-use loop for actions | 🟡 | import/list/execute-with-approval + offline/REST paths done; autonomous loop needs a live model key |
| O3 | Agent schedules (coworker C7 / stage 6) | ⬜ | reuse connector scheduler pattern for agent jobs |
| O4 | Budget hard-enforcement in gateway (coworker C8) | 🟡 | accepted as param; enforce stop-when-exceeded + per-schedule |
| O5 | Agent computers (stage 5): isolated browser/files/terminal + human takeover | ⬜ | optional, off by default |
| O6 | Channels: Slack / Teams / Discord / voice into authorized task context (stage 7) | ⬜ | hand-offs already covered by task rooms |
| O7 | GraphRAG community summaries | ⬜ | helps hardest global questions only; AHR closes most of the gap |
| O8 | Vector quantization at scale (>5M vectors) | ⬜ | optimization, not a feature gap |
| O9 | Craft-style sandboxed web-app (HTML) artifact type | ⬜ | PLAN Phase 2 |
| O10 | Office round-trip editing (import .docx/.pptx/.xlsx → edit → re-export) | ⬜ | PLAN Phase 3 |
| O11 | Brand kits / white-label theming for artifacts | ⬜ | PLAN Phase 3 |
| O12 | Indic-language locales (UI i18n beyond the 9 Onyx locales) | ⬜ | answer-language already supports many; UI strings pending |

---

## 5. How this file is maintained

- Update the relevant row's status the moment a feature lands (and reference the
  commit in the PR/commit body, not here).
- When a new feature is proposed, add a row under the right section as ⬜ first.
- Keep `PLAN.md` for the *why/architecture*; keep this file for *what/where/status*.
