/**
 * Backend API client. The app talks to the real Enaz backend for everything —
 * auth, search, streaming answers, artifacts, agents, admin, the code sandbox.
 *
 * `VITE_API_URL` points at the backend. When unset it is same-origin (""), so a
 * reverse proxy / the dev proxy in vite.config.ts forwards `/api` to the backend.
 */

const BASE = ((import.meta.env["VITE_API_URL"] as string | undefined) ?? "").replace(/\/$/, "");

const TOKEN_KEY = "enaz-token";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked; session stays in-memory only
  }
}

function headers(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json", ...extra };
  const token = getToken();
  if (token) h["authorization"] = `Bearer ${token}`;
  return h;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: headers() });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

export async function apiSend<T = unknown>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const init: RequestInit = { method, headers: headers() };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new ApiError(res.status, await res.text());
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

export function downloadUrl(path: string): string {
  return `${BASE}${path}`;
}

/** POST an SSE endpoint and invoke `onEvent` for each JSON event. Returns an abort handle. */
export async function apiStream(
  path: string,
  body: unknown,
  onEvent: (event: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const init: RequestInit = { method: "POST", headers: headers(), body: JSON.stringify(body) };
  if (signal) init.signal = signal;
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok || !res.body)
    throw new ApiError(res.status, await res.text().catch(() => "stream failed"));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        // ignore malformed frame
      }
    }
  }
}

// ---- typed auth helpers ---------------------------------------------------
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  roleLabel: string;
  title: string;
  avatar: string;
  permissions: string[];
};

export async function apiDemoLogin(role: string): Promise<{ token: string; user: SessionUser }> {
  return apiSend("/api/auth/demo-login", "POST", { role });
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<{ token: string; user: SessionUser }> {
  return apiSend("/api/auth/login", "POST", { email, password });
}

export async function apiMe(): Promise<{
  user: SessionUser;
  tenantId: string;
  principals: string[];
}> {
  return apiGet("/api/auth/me");
}

// ---- resource endpoints ---------------------------------------------------
export const api = {
  // search
  search: (q: string, params: { sources?: string[]; types?: string[]; documentSet?: string } = {}) => {
    const qs = new URLSearchParams({ q });
    (params.sources ?? []).forEach((s) => qs.append("sources", s));
    (params.types ?? []).forEach((t) => qs.append("types", t));
    if (params.documentSet) qs.append("documentSet", params.documentSet);
    return apiGet<SearchResponse>(`/api/search?${qs.toString()}`);
  },

  // assistant
  conversations: () => apiGet<{ conversations: ConversationSummary[] }>("/api/assistant/conversations"),
  shareChat: (title: string, turns: unknown[]) =>
    apiSend<{ id: string; url: string }>("/api/assistant/share", "POST", { title, turns }),
  myShares: () => apiGet<{ shares: ShareRow[] }>("/api/assistant/shares"),
  compare: (query: string, models: string[], sources?: string[]) =>
    apiSend<CompareResponse>("/api/assistant/compare", "POST", sources ? { query, models, sources } : { query, models }),
  revokeShare: (id: string) => apiSend(`/api/assistant/shares/${id}/revoke`, "POST"),
  readShared: (id: string) => apiGet<SharedChat>(`/api/shared/${id}`),

  // skills + OpenAPI actions
  skills: () => apiGet<{ skills: SkillRow[] }>("/api/skills"),
  createSkill: (body: { name: string; description?: string; instructions?: string; tools?: string[]; shared?: boolean }) =>
    apiSend<{ id: string; slug: string }>("/api/skills", "POST", body),
  deleteSkill: (id: string) => apiSend(`/api/skills/${id}`, "DELETE"),
  actions: () => apiGet<{ actions: ActionRow[] }>("/api/actions"),
  importActions: (spec: string, baseUrl?: string) =>
    apiSend<{ collection: string; imported: number; actions: { name: string; method: string; path: string }[] }>(
      "/api/actions/import",
      "POST",
      baseUrl ? { spec, baseUrl } : { spec },
    ),
  deleteAction: (id: string) => apiSend(`/api/actions/${id}`, "DELETE"),

  // connectors
  connectors: () => apiGet<ConnectorsResponse>("/api/connectors"),
  connectorCatalog: () => apiGet<{ connectors: CatalogEntry[] }>("/api/connectors/catalog"),
  createConnector: (body: {
    type: string;
    name?: string;
    config?: Record<string, unknown>;
    credentialId?: string;
    refreshFreqMinutes?: number;
    sync?: boolean;
  }) => apiSend("/api/connectors", "POST", body),
  syncConnector: (id: string) => apiSend(`/api/connectors/${id}/sync`, "POST"),
  deleteConnector: (id: string) => apiSend(`/api/connectors/${id}`, "DELETE"),
  patchConnector: (id: string, body: { name?: string; refreshFreqMinutes?: number; credentialId?: string }) =>
    apiSend(`/api/connectors/${id}`, "PATCH", body),
  pauseConnector: (id: string) => apiSend(`/api/connectors/${id}/pause`, "POST"),
  resumeConnector: (id: string) => apiSend(`/api/connectors/${id}/resume`, "POST"),
  connectorAttempts: (id: string) => apiGet<{ attempts: IndexAttempt[] }>(`/api/connectors/${id}/attempts`),
  // credentials
  credentials: () => apiGet<{ credentials: CredentialRow[] }>("/api/connectors/credentials"),
  createCredential: (body: { type: string; name: string; secret: Record<string, unknown> }) =>
    apiSend<{ id: string }>("/api/connectors/credentials", "POST", body),
  deleteCredential: (id: string) => apiSend(`/api/connectors/credentials/${id}`, "DELETE"),
  // document sets
  documentSets: () => apiGet<{ documentSets: DocumentSet[] }>("/api/connectors/document-sets"),
  createDocumentSet: (body: { name: string; description?: string; connectorIds?: string[] }) =>
    apiSend<{ id: string }>("/api/connectors/document-sets", "POST", body),
  updateDocumentSet: (id: string, body: { name: string; description?: string; connectorIds?: string[] }) =>
    apiSend(`/api/connectors/document-sets/${id}`, "PUT", body),
  deleteDocumentSet: (id: string) => apiSend(`/api/connectors/document-sets/${id}`, "DELETE"),

  // artifacts
  artifacts: () => apiGet<{ artifacts: ArtifactRow[] }>("/api/artifacts"),
  artifact: (id: string) => apiGet<ArtifactDetail>(`/api/artifacts/${id}`),
  patchArtifact: (id: string, instruction: string) => apiSend(`/api/artifacts/${id}/patch`, "POST", { instruction }),
  artifactFreshness: (id: string) => apiGet<ArtifactFreshness>(`/api/artifacts/${id}/freshness`),
  refreshArtifact: (id: string) => apiSend<ArtifactRefresh>(`/api/artifacts/${id}/refresh`, "POST"),
  acceptArtifactRefresh: (id: string, spec: Record<string, unknown>) =>
    apiSend<{ id: string; version: number; title: string }>(`/api/artifacts/${id}/refresh/accept`, "POST", { spec }),
  updateArtifact: (id: string, body: { pinned?: boolean; shared?: string }) => apiSend(`/api/artifacts/${id}`, "PATCH", body),
  deleteArtifact: (id: string) => apiSend(`/api/artifacts/${id}`, "DELETE"),

  // work inbox
  inbox: () => apiGet<InboxResponse>("/api/inbox"),

  // answer corrections
  corrections: () => apiGet<{ corrections: Correction[]; canReview: boolean }>("/api/corrections"),
  submitCorrection: (body: { query: string; correctedAnswer: string; originalAnswer?: string; evidenceUrl?: string; scope?: string[] }) =>
    apiSend<{ id: string; status: string }>("/api/corrections", "POST", body),
  reviewCorrection: (id: string, body: { decision: "approve" | "reject"; scope?: string[]; expiresDays?: number; note?: string }) =>
    apiSend(`/api/corrections/${id}/review`, "POST", body),
  deleteCorrection: (id: string) => apiSend(`/api/corrections/${id}`, "DELETE"),

  // agents
  agents: () => apiGet<{ agents: AgentRow[] }>("/api/agents"),
  createAgent: (body: Record<string, unknown>) => apiSend("/api/agents", "POST", body),
  testAgent: (id: string, task?: string) => apiSend<AgentTestResult>(`/api/agents/${id}/test`, "POST", task ? { task } : {}),
  approvals: () => apiGet<{ approvals: ApprovalRow[] }>("/api/approvals"),
  decideApproval: (id: string, decision: "approve" | "deny", args?: Record<string, unknown>) =>
    apiSend<{ ok: boolean; status: string; jobStatus: string | null }>(
      `/api/approvals/${id}`,
      "POST",
      args ? { decision, args } : { decision },
    ),

  // live business-data sources
  liveSources: () => apiGet<{ sources: LiveSource[] }>("/api/live"),
  createLiveSource: (body: { name: string; kind: string; description?: string; config: Record<string, unknown> }) =>
    apiSend<{ id: string }>("/api/live", "POST", body),
  deleteLiveSource: (id: string) => apiSend(`/api/live/${id}`, "DELETE"),
  queryLiveSource: (id: string) => apiSend<LiveQueryResult>(`/api/live/${id}/query`, "POST"),

  // durable agent runs (jobs)
  enqueueJob: (agentId: string, body: { task?: string; budget?: number; idempotencyKey?: string } = {}) =>
    apiSend<{ jobId: string; status: string }>(`/api/agents/${agentId}/jobs`, "POST", body),
  jobs: () => apiGet<{ jobs: JobRow[] }>("/api/jobs"),
  job: (id: string, after = 0) => apiGet<JobDetail>(`/api/jobs/${id}?after=${after}`),
  cancelJob: (id: string) => apiSend<{ ok: boolean; status: string }>(`/api/jobs/${id}/cancel`, "POST"),

  // settings
  settings: () => apiGet<SettingsResponse>("/api/settings"),
  saveSettings: (settings: Record<string, unknown>) => apiSend("/api/settings", "PUT", { settings }),
  updateProfile: (body: { name?: string; title?: string }) => apiSend("/api/settings/profile", "PUT", body),
  memory: () => apiGet<{ memories: MemoryRow[] }>("/api/settings/memory"),
  addMemory: (body: string | { text: string; scope?: string; agentId?: string; useInRuns?: boolean }) =>
    apiSend<{ id: string; scope: string }>("/api/settings/memory", "POST", typeof body === "string" ? { text: body } : body),
  deleteMemory: (id: string) => apiSend(`/api/settings/memory/${id}`, "DELETE"),
  shortcuts: () => apiGet<{ shortcuts: ShortcutRow[] }>("/api/settings/shortcuts"),
  addShortcut: (body: { command: string; prompt: string; shared?: boolean }) => apiSend("/api/settings/shortcuts", "POST", body),
  deleteShortcut: (id: string) => apiSend(`/api/settings/shortcuts/${id}`, "DELETE"),
  tokens: () => apiGet<TokensResponse>("/api/settings/tokens"),
  createTokenApi: (body: { name: string; scopes: string[]; expiresDays?: number }) =>
    apiSend<{ id: string; token: string; prefix: string }>("/api/settings/tokens", "POST", body),
  revokeToken: (id: string) => apiSend(`/api/settings/tokens/${id}`, "DELETE"),

  // insights
  insights: (days = 7) => apiGet<InsightsResponse>(`/api/insights?days=${days}`),
  history: (limit = 50) => apiGet<{ history: HistoryRow[] }>(`/api/insights/history?limit=${limit}`),

  // admin
  adminOverview: () => apiGet<AdminOverview>("/api/admin/overview"),
  adminUsers: () => apiGet<{ users: AdminUser[] }>("/api/admin/users"),
  updateUser: (id: string, body: { role?: string; disabled?: boolean }) => apiSend(`/api/admin/users/${id}`, "PATCH", body),
  adminGroups: () => apiGet<{ groups: GroupRow[] }>("/api/admin/groups"),
  adminSso: () => apiGet<{ providers: SsoRow[] }>("/api/admin/sso"),
  adminVerified: () => apiGet<{ answers: VerifiedRow[] }>("/api/admin/verified"),
  runEval: () => apiSend<EvalMetrics>("/api/admin/evals/run", "POST"),
  evalHistory: () => apiGet<{ runs: EvalMetrics[] }>("/api/admin/evals"),
  auditLog: () => apiGet<{ log: AuditRow[] }>("/api/admin/audit"),
  wsSetting: (key: string) => apiGet<{ key: string; value: Record<string, unknown> }>(`/api/admin/settings/${key}`),
  saveWsSetting: (key: string, value: Record<string, unknown>) => apiSend(`/api/admin/settings/${key}`, "PUT", { value }),

  // conversations / sandbox
  conversationFiles: (cid: string) => apiGet<{ files: SessionFile[] }>(`/api/conversations/${cid}/files`),
  runCode: (cid: string, code: string) => apiSend<RunResult>(`/api/conversations/${cid}/run`, "POST", { code }),
  editFile: (cid: string, name: string, content: string) => apiSend(`/api/conversations/${cid}/files/${name}`, "PUT", { content }),
  deleteFile: (cid: string, name: string) => apiSend(`/api/conversations/${cid}/files/${name}`, "DELETE"),
  uploadConversationFile: (cid: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiUpload<{ name: string; size: number; extracted: boolean; preview: string }>(`/api/conversations/${cid}/files`, form);
  },
  uploadDocument: (file: File, access = "public") => {
    const form = new FormData();
    form.append("file", file);
    form.append("access", access);
    return apiUpload<{ docId: string; title: string }>("/api/connectors/upload", form);
  },
};

// ---- response types -------------------------------------------------------
export type ConversationSummary = { id: string; title: string; updatedAt: number };
export type ShareRow = { id: string; title: string; views: number; revoked: boolean; createdAt: number; url: string };
export type SharedChat = { title: string; author: string; turns: unknown[]; createdAt: number };
export type CompareAnswer = {
  model: string; servedModel: string; answer: string;
  paragraphs: { text: string; cites: number[] }[];
  cost: number; latencyMs: number; verification: { supported: number; total: number };
};
export type CompareResponse = {
  query: string; answers: CompareAnswer[];
  sources: { n: number; title: string; source: string; snippet: string }[];
};
export type SkillRow = {
  id: string; slug: string; name: string; description: string; instructions: string;
  tools: string[]; shared: boolean; enabled: boolean;
};
export type ActionRow = {
  id: string; collection: string; name: string; method: string; path: string; baseUrl: string;
  summary: string; requiresApproval: boolean; parameters: { name: string; in: string; required: boolean }[];
};
export type SearchHit = {
  chunkId: string; docId: string; title: string; source: string; url: string | null;
  path: string; type: string; owner: string; updatedAt: number; snippet: string; score: number;
};
export type SearchResponse = {
  query: string; results: SearchHit[]; web: { title: string; url: string; snippet: string }[];
  webEnabled: boolean; facets: { sources: { value: string; count: number }[]; types: { value: string; count: number }[] };
  experts: { name: string; topic: string }[]; confidence: number; tookMs: number;
};
export type ConnectorRow = {
  id: string; type: string; name: string; status: string; freshness: string; docs: number;
  permissionSync: boolean; lastSync: number | null;
  credentialId: string | null; refreshFreqMinutes: number; paused: boolean;
  newDocs: number; updatedDocs: number; removedDocs: number; nextSync: number | null; error: string | null;
};
export type ConnectorsResponse = { connected: ConnectorRow[]; stats: { documents: number; chunks: number; bySource: { source: string; docs: number }[] } };
export type IndexAttempt = {
  id: string; status: string; trigger: string; new: number; updated: number; removed: number;
  total: number; error: string | null; startedAt: number; finishedAt: number | null;
};
export type CredentialRow = { id: string; type: string; name: string; keys: string[]; createdAt: number };
export type DocumentSet = { id: string; name: string; description: string; connectorIds: string[] };
export type CatalogEntry = { logo: string; name: string; type: string; category: string; sync: string; acl: boolean; live: boolean };
export type ArtifactRow = {
  id: string; title: string; kind: string; format: string; shared: string; pinned: boolean;
  versions: number; sources: number; updatedAt: number; author: string;
};
export type ArtifactDetail = { id: string; title: string; kind: string; format: string; version: number; spec: Record<string, unknown>; versions: { version: number; note: string; created_at: number }[] };
export type InboxItem = {
  id: string; type: "approval" | "run" | "correction"; bucket: "needs_decision" | "running" | "completed" | "failed";
  title: string; detail: string; nextAction: string; tool?: string;
  ref: { kind: string; id: string }; createdAt: number | null;
};
export type InboxResponse = {
  items: InboxItem[];
  counts: { needs_decision: number; running: number; completed: number; failed: number };
  canReview: boolean;
};
export type Correction = {
  id: string; query: string; originalAnswer: string; correctedAnswer: string; evidenceUrl: string;
  scope: string[]; status: string; submitter: string; reviewer: string; reviewNote: string;
  approvedAt: number | null; expiresAt: number | null; createdAt: number;
};
export type AgentTestResult = {
  agent: string; task: string; sourcesAccessed: string[]; sampleAnswer: string;
  proposedTools: { tool: string; wouldCall: boolean; verifiedAgainstLive: boolean }[];
  proposedChanges: { tool: string; summary: string }[];
  followedInstructions: { producedAnswer: boolean; stayedWithinSourceScope: boolean; scope: unknown };
  estimatedCost: number; note: string;
};
export type ArtifactFreshness = {
  stale: boolean; sourceCount: number; checkedAt: number;
  changedSources: { docId: string; title: string }[]; missingSources: { docId: string; title: string }[];
};
export type ArtifactRefresh = {
  currentSpec: Record<string, unknown>; proposedSpec: Record<string, unknown>;
  diff: { change: string; [k: string]: unknown }[];
};
export type LiveSource = { id: string; name: string; kind: string; description: string; enabled: boolean };
export type LiveQueryResult = { name: string; columns: string[]; rows: unknown[][]; checkedAt: number; rowCount: number };
export type MemoryRow = {
  id: string; text: string; source: string; scope: string; agentId: string | null;
  useInRuns: boolean; createdAt: number;
};
export type JobRow = {
  id: string; status: string; task: string; agent: string | null; cost: number;
  error: string | null; createdAt: number | null; finishedAt: number | null;
};
export type JobEvent = { seq: number; type: string; [k: string]: unknown };
export type JobReceipt = { actionId: string; step: string; tool: string; status: string; createdAt: number | null };
export type JobDetail = {
  id: string; status: string; task: string; agent: string | null; cost: number;
  error: string | null; result: Record<string, unknown>; createdAt: number | null; finishedAt: number | null;
  events: JobEvent[]; receipts: JobReceipt[];
};
export type AgentRow = {
  id: string; name: string; description: string; tools: string[]; trigger: string; output: string;
  enabled: boolean; owner: string; runs: number; success: number; lastRun: number | null;
};
export type ApprovalRow = { id: string; tool: string; args: Record<string, unknown>; status: string; createdAt: number };
export type SettingsResponse = { profile: SessionUser; settings: Record<string, unknown> };
export type ShortcutRow = { id: string; command: string; prompt: string; shared: boolean };
export type TokensResponse = { mcpUrl: string; tokens: { id: string; name: string; prefix: string; scopes: string[]; createdAt: number; expiresAt: number | null; lastUsed: number | null }[] };
export type InsightsResponse = {
  stats: { queries: number; answerRate: number; p50LatencyMs: number; avgCost: number; totalCost: number; baselineCost: number; savingsPct: number; cacheHitRate: number };
  volume: { day: string; queries: number; answered: number }[];
  modelMix: { name: string; value: number }[];
  knowledgeGaps: { question: string; asks: number; status: string }[];
};
export type HistoryRow = { query: string; path: string; model: string; cost: number; confidence: number; answered: boolean; createdAt: number; avatar: string };
export type AdminOverview = { users: number; groups: number; connectors: number; plan: string; documents: number; chunks: number; llm: { offline: boolean; models: Record<string, string> } };
export type AdminUser = { id: string; email: string; name: string; role: string; title: string; avatar: string; disabled: boolean };
export type GroupRow = { id: string; name: string; source: string; members: number };
export type SsoRow = { id: string; type: string; name: string; issuer: string | null; enabled: boolean };
export type VerifiedRow = { id: string; question: string; answer: string; category: string };
export type EvalMetrics = { name: string; questions: number; recallAt10: number; citationRate: number; answerRate: number; createdAt?: number };
export type AuditRow = { action: string; target: string; createdAt: number; user: string };
export type SessionFile = { name: string; size: number; isImage: boolean; source: string };
export type RunResult = {
  stdout: string; stderr: string; returnCode: number; timedOut: boolean; durationMs: number; networkIsolated: boolean;
  files: { name: string; size: number; isNew: boolean; isImage: boolean }[];
  images: { name: string; dataUrl: string }[];
};
