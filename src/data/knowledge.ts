import type { FileFormat } from "@/components/app/file-formats";

export type SourceApp =
  | "drive"
  | "slack"
  | "confluence"
  | "jira"
  | "github"
  | "notion"
  | "salesforce"
  | "sharepoint"
  | "gmail"
  | "zendesk";

export const sourceLabel: Record<SourceApp, string> = {
  drive: "Google Drive",
  slack: "Slack",
  confluence: "Confluence",
  jira: "Jira",
  github: "GitHub",
  notion: "Notion",
  salesforce: "Salesforce",
  sharepoint: "SharePoint",
  gmail: "Gmail",
  zendesk: "Zendesk",
};

export const sourceTint: Record<SourceApp, string> = {
  drive: "bg-chart-2/15 text-chart-2",
  slack: "bg-chart-3/15 text-chart-3",
  confluence: "bg-info/15 text-info",
  jira: "bg-brand/12 text-brand",
  github: "bg-muted text-foreground",
  notion: "bg-muted text-foreground",
  salesforce: "bg-chart-2/15 text-chart-2",
  sharepoint: "bg-success/15 text-success",
  gmail: "bg-destructive/15 text-destructive",
  zendesk: "bg-warning/18 text-warning",
};

export type Doc = {
  id: string;
  title: string;
  source: SourceApp;
  type: "doc" | "sheet" | "slides" | "thread" | "ticket" | "page" | "code" | "email";
  owner: string;
  updated: string;
  snippet: string;
  path: string;
};

export const docs: Doc[] = [
  {
    id: "d1",
    title: "Q3 Enterprise Pricing Proposal",
    source: "drive",
    type: "doc",
    owner: "Ava Thompson",
    updated: "2 days ago",
    snippet:
      "Proposed seat price moves to $24/user/month with volume tiers at 500 and 2,000 seats. Self-host edition stays free including permission sync.",
    path: "Drive › Strategy › Pricing",
  },
  {
    id: "d2",
    title: "#launch-knowledge — GA readiness thread",
    source: "slack",
    type: "thread",
    owner: "Noah Patel",
    updated: "5 hours ago",
    snippet:
      "Connector freshness is now under 4 minutes for Slack, Drive and Jira. SharePoint permission sync is the last blocker for GA.",
    path: "Slack › #launch-knowledge",
  },
  {
    id: "d3",
    title: "Retrieval Architecture v2",
    source: "confluence",
    type: "page",
    owner: "Mia Chen",
    updated: "1 week ago",
    snippet:
      "Hybrid BM25 + dense + sparse fused with RRF, followed by cross-encoder rerank. Contextual chunk headers reduced retrieval failures by 41% on the golden set.",
    path: "Engineering › Search › Architecture",
  },
  {
    id: "d4",
    title: "KNOW-482 SharePoint group expansion fails for nested groups",
    source: "jira",
    type: "ticket",
    owner: "Liam Rodriguez",
    updated: "yesterday",
    snippet:
      "Nested AD groups beyond depth 3 are not expanded, causing false negatives in ACL filtering. Fix in review, ETA Friday.",
    path: "Jira › KNOW › Sprint 42",
  },
  {
    id: "d5",
    title: "Competitive bake-off results — Acme Corp",
    source: "sharepoint",
    type: "sheet",
    owner: "Ava Thompson",
    updated: "3 days ago",
    snippet:
      "Blind grading on 300 questions: Enaz 82% correct with citations, incumbent 71%. Median answer latency 2.1s vs 3.8s.",
    path: "SharePoint › Sales › Bake-offs",
  },
  {
    id: "d6",
    title: "artifacts-service: deck renderer",
    source: "github",
    type: "code",
    owner: "Ethan Brooks",
    updated: "4 hours ago",
    snippet:
      "renderDeck(spec: DeckSpec) maps layouts to brand template masters and writes speaker notes with source citations.",
    path: "github.com/enaz/artifacts-service",
  },
  {
    id: "d7",
    title: "Customer onboarding playbook",
    source: "notion",
    type: "page",
    owner: "Sofia Garcia",
    updated: "2 weeks ago",
    snippet:
      "Week 1: connect identity provider and top 3 sources. Week 2: golden-set creation with champions. Week 3: rollout to 10% of employees.",
    path: "Notion › Customer Success",
  },
  {
    id: "d8",
    title: "Renewal risk — Globex (Opportunity)",
    source: "salesforce",
    type: "doc",
    owner: "Noah Patel",
    updated: "today",
    snippet:
      "Renewal on Nov 30. Champion asked for SharePoint permission sync and an on-prem deployment option.",
    path: "Salesforce › Opportunities",
  },
];

export const docById = (id: string) => docs.find((d) => d.id === id);

export type Step = {
  label: string;
  detail: string;
  tool: "plan" | "search" | "read" | "graph" | "verify" | "artifact" | "code";
};

export type ArtifactKind = "slides" | "doc" | "sheet";

export type Conversation = {
  id: string;
  title: string;
  when: string;
};

export const conversations: Conversation[] = [
  { id: "c1", title: "GA readiness summary deck", when: "Today" },
  { id: "c2", title: "Who owns SharePoint permission sync?", when: "Today" },
  { id: "c3", title: "Pricing proposal vs competitors", when: "Yesterday" },
  { id: "c4", title: "Onboarding checklist for Globex", when: "Mon" },
  { id: "c5", title: "Bake-off results spreadsheet", when: "Last week" },
];

export const suggestedPrompts = [
  {
    title: "Build a GA readiness deck",
    hint: "Slides from Slack, Jira and Confluence",
    kind: "slides" as ArtifactKind,
  },
  {
    title: "Draft the Q3 pricing memo",
    hint: "Word doc with citations",
    kind: "doc" as ArtifactKind,
  },
  {
    title: "Export bake-off results",
    hint: "Spreadsheet with formulas and charts",
    kind: "sheet" as ArtifactKind,
  },
  {
    title: "What's blocking the GA launch?",
    hint: "Quick answer across all sources",
    kind: undefined,
  },
];

export const demoAnswer = {
  steps: [
    {
      tool: "plan",
      label: "Planned research",
      detail: "3 sub-questions: status, blockers, owners",
    },
    {
      tool: "search",
      label: "Searched 4 sources",
      detail: "Slack, Jira, Confluence, SharePoint · 38 candidates",
    },
    {
      tool: "graph",
      label: "Resolved owners",
      detail: "Enterprise graph → Liam Rodriguez, Mia Chen",
    },
    { tool: "read", label: "Read 5 documents", detail: "Loaded full sections, 9.4K tokens" },
    { tool: "verify", label: "Verified 7 claims", detail: "All claims supported by sources" },
    { tool: "artifact", label: "Created artifact", detail: "GA readiness deck · 5 slides" },
  ] as Step[],
  paragraphs: [
    {
      text: "The launch is on track except for one blocker: SharePoint permission sync.",
      cites: ["d2"],
    },
    {
      text: "Connector freshness is under 4 minutes for Slack, Drive and Jira, and the hybrid retrieval stack with contextual chunk headers cut retrieval failures by 41%.",
      cites: ["d2", "d3"],
    },
    {
      text: "The remaining issue is nested AD group expansion beyond depth 3 (KNOW-482), owned by Liam Rodriguez with a fix in review and an ETA of Friday.",
      cites: ["d4"],
    },
    {
      text: "Commercially, the Acme bake-off showed 82% vs 71% accuracy and 2.1s vs 3.8s latency, and Globex's renewal depends on the same SharePoint fix.",
      cites: ["d5", "d8"],
    },
  ],
};

export const deckSlides = [
  {
    title: "GA Readiness — Enaz Knowledge",
    bullets: ["Status as of this week", "Prepared from 5 cited sources"],
    layout: "title",
  },
  {
    title: "Where we are",
    bullets: [
      "Freshness < 4 min on Slack, Drive, Jira",
      "Retrieval failures −41% with contextual chunks",
      "Median answer latency 2.1s",
    ],
    layout: "bullets",
  },
  { title: "Bake-off: accuracy", bullets: ["Enaz 82%", "Incumbent 71%"], layout: "chart" },
  {
    title: "Blocker: SharePoint permission sync",
    bullets: [
      "Nested AD groups > depth 3 not expanded",
      "Owner: Liam Rodriguez · ETA Friday",
      "Impacts Globex renewal (Nov 30)",
    ],
    layout: "bullets",
  },
  {
    title: "Next steps",
    bullets: ["Merge KNOW-482 fix", "Re-run ACL audit", "Go / no-go review Monday"],
    layout: "bullets",
  },
];

export const sheetRows = [
  { metric: "Correct w/ citations", enaz: 0.82, incumbent: 0.71 },
  { metric: "Median latency (s)", enaz: 2.1, incumbent: 3.8 },
  { metric: "Cost / answer ($)", enaz: 0.008, incumbent: 0.031 },
  { metric: "Questions graded", enaz: 300, incumbent: 300 },
];

export type Connector = {
  id: string;
  source: SourceApp;
  status: "healthy" | "syncing" | "error" | "available";
  docs: number;
  lastSync: string;
  permissionSync: boolean;
  freshness: string;
};

export const connectors: Connector[] = [
  {
    id: "k1",
    source: "slack",
    status: "healthy",
    docs: 412_300,
    lastSync: "1 min ago",
    permissionSync: true,
    freshness: "real-time",
  },
  {
    id: "k2",
    source: "drive",
    status: "healthy",
    docs: 88_412,
    lastSync: "3 min ago",
    permissionSync: true,
    freshness: "push",
  },
  {
    id: "k3",
    source: "confluence",
    status: "syncing",
    docs: 21_904,
    lastSync: "syncing…",
    permissionSync: true,
    freshness: "webhook",
  },
  {
    id: "k4",
    source: "jira",
    status: "healthy",
    docs: 64_120,
    lastSync: "2 min ago",
    permissionSync: true,
    freshness: "webhook",
  },
  {
    id: "k5",
    source: "sharepoint",
    status: "error",
    docs: 31_877,
    lastSync: "2 h ago",
    permissionSync: false,
    freshness: "poll 15m",
  },
  {
    id: "k6",
    source: "github",
    status: "healthy",
    docs: 9_310,
    lastSync: "6 min ago",
    permissionSync: true,
    freshness: "webhook",
  },
  {
    id: "k7",
    source: "salesforce",
    status: "healthy",
    docs: 15_022,
    lastSync: "9 min ago",
    permissionSync: true,
    freshness: "poll 10m",
  },
  {
    id: "k8",
    source: "notion",
    status: "available",
    docs: 0,
    lastSync: "—",
    permissionSync: true,
    freshness: "—",
  },
  {
    id: "k9",
    source: "gmail",
    status: "available",
    docs: 0,
    lastSync: "—",
    permissionSync: true,
    freshness: "—",
  },
  {
    id: "k10",
    source: "zendesk",
    status: "available",
    docs: 0,
    lastSync: "—",
    permissionSync: true,
    freshness: "—",
  },
];

export type Agent = {
  id: string;
  name: string;
  description: string;
  tools: string[];
  trigger: string;
  runs: number;
  success: number;
  owner: string;
  output: ArtifactKind | "answer";
};

export const agents: Agent[] = [
  {
    id: "a1",
    name: "Weekly status deck",
    description:
      "Every Friday, summarizes Jira progress and Slack decisions into a branded 6-slide deck.",
    tools: ["Jira", "Slack", "Slides"],
    trigger: "Fridays 4pm",
    runs: 38,
    success: 97,
    owner: "Ava Thompson",
    output: "slides",
  },
  {
    id: "a2",
    name: "Renewal risk analyst",
    description:
      "Scores open renewals from Salesforce, support tickets and usage, exports a ranked sheet.",
    tools: ["Salesforce", "Zendesk", "Code sandbox", "Sheet"],
    trigger: "Mondays 9am",
    runs: 22,
    success: 95,
    owner: "Noah Patel",
    output: "sheet",
  },
  {
    id: "a3",
    name: "Support answer drafter",
    description:
      "Drafts cited replies to new support tickets and asks for approval before posting.",
    tools: ["Zendesk", "Confluence", "Search"],
    trigger: "New ticket",
    runs: 1_284,
    success: 91,
    owner: "Sofia Garcia",
    output: "answer",
  },
  {
    id: "a4",
    name: "RFP responder",
    description:
      "Answers security and RFP questionnaires from approved knowledge, outputs a Word doc.",
    tools: ["Search", "Drive", "Doc"],
    trigger: "On demand",
    runs: 64,
    success: 89,
    owner: "Mia Chen",
    output: "doc",
  },
  {
    id: "a5",
    name: "Incident postmortem writer",
    description:
      "Collects the incident Slack channel, PagerDuty timeline and PRs into a postmortem doc.",
    tools: ["Slack", "GitHub", "MCP: PagerDuty", "Doc"],
    trigger: "Incident resolved",
    runs: 11,
    success: 100,
    owner: "Ethan Brooks",
    output: "doc",
  },
];

export type ArtifactItem = {
  id: string;
  title: string;
  format: FileFormat;
  /** Opens in the assistant canvas when set. */
  kind?: ArtifactKind;
  versions: number;
  sources: number;
  updated: string;
  author: string;
  size: string;
  shared: "private" | "team" | "org";
  pinned?: boolean;
};

export const artifactItems: ArtifactItem[] = [
  {
    id: "f1",
    title: "GA readiness deck",
    format: "pptx",
    kind: "slides",
    versions: 4,
    sources: 5,
    updated: "10 min ago",
    author: "Assistant",
    size: "2.4 MB",
    shared: "team",
    pinned: true,
  },
  {
    id: "f2",
    title: "Q3 pricing memo",
    format: "docx",
    kind: "doc",
    versions: 2,
    sources: 7,
    updated: "yesterday",
    author: "Ava Thompson",
    size: "184 KB",
    shared: "private",
  },
  {
    id: "f3",
    title: "Acme bake-off results",
    format: "xlsx",
    kind: "sheet",
    versions: 3,
    sources: 3,
    updated: "3 days ago",
    author: "Assistant",
    size: "96 KB",
    shared: "org",
    pinned: true,
  },
  {
    id: "f4",
    title: "Support quality dashboard",
    format: "html",
    versions: 6,
    sources: 12,
    updated: "today",
    author: "Assistant",
    size: "Live app",
    shared: "team",
  },
  {
    id: "f5",
    title: "Globex security questionnaire",
    format: "pdf",
    versions: 5,
    sources: 24,
    updated: "Mon",
    author: "RFP responder",
    size: "1.1 MB",
    shared: "private",
  },
  {
    id: "f6",
    title: "Weekly status — Sprint 42",
    format: "pptx",
    kind: "slides",
    versions: 1,
    sources: 18,
    updated: "Fri",
    author: "Weekly status deck",
    size: "3.0 MB",
    shared: "team",
  },
  {
    id: "f7",
    title: "Renewal risk — October",
    format: "xlsx",
    kind: "sheet",
    versions: 1,
    sources: 41,
    updated: "Mon",
    author: "Renewal risk analyst",
    size: "212 KB",
    shared: "team",
  },
  {
    id: "f8",
    title: "Onboarding playbook v2",
    format: "md",
    kind: "doc",
    versions: 8,
    sources: 9,
    updated: "last week",
    author: "Sofia Garcia",
    size: "22 KB",
    shared: "org",
  },
  {
    id: "f9",
    title: "Ticket volume export",
    format: "csv",
    versions: 1,
    sources: 1,
    updated: "last week",
    author: "Assistant",
    size: "1.8 MB",
    shared: "private",
  },
  {
    id: "f10",
    title: "Architecture diagram",
    format: "png",
    versions: 2,
    sources: 3,
    updated: "2 weeks ago",
    author: "Mia Chen",
    size: "640 KB",
    shared: "team",
  },
];

export const queryVolume = [
  { day: "Mon", queries: 4120, answered: 3790 },
  { day: "Tue", queries: 4630, answered: 4290 },
  { day: "Wed", queries: 4980, answered: 4650 },
  { day: "Thu", queries: 5210, answered: 4910 },
  { day: "Fri", queries: 4470, answered: 4230 },
  { day: "Sat", queries: 920, answered: 870 },
  { day: "Sun", queries: 760, answered: 720 },
];

export const modelMix = [
  { name: "Small (router, rewrite)", value: 71 },
  { name: "Mid (answers)", value: 24 },
  { name: "Large (research, artifacts)", value: 5 },
];

export const knowledgeGaps = [
  {
    question: "What is our data retention policy for EU customers?",
    asks: 46,
    status: "No source found",
  },
  { question: "How do I request a GPU quota increase?", asks: 31, status: "Outdated doc (2023)" },
  {
    question: "Which SSO providers do we support on-prem?",
    asks: 27,
    status: "Contradicting docs",
  },
  { question: "Parental leave policy for contractors", asks: 19, status: "No source found" },
];

/** Maps a document source to its BrandLogo id. */
export const sourceLogo: Record<SourceApp, string> = {
  drive: "googledrive",
  slack: "slack",
  confluence: "confluence",
  jira: "jira",
  github: "github",
  notion: "notion",
  salesforce: "salesforce",
  sharepoint: "sharepoint",
  gmail: "gmail",
  zendesk: "zendesk",
};

export type CatalogCategory =
  "Messaging" | "Storage" | "Wiki & Docs" | "Tickets & Projects" | "Code" | "Sales & CRM" | "Other";

export type CatalogEntry = {
  logo: string;
  name: string;
  category: CatalogCategory;
  sync: "Webhook" | "Poll" | "Federated" | "Upload";
  acl: boolean;
};

export const connectorCatalog: CatalogEntry[] = [
  { logo: "slack", name: "Slack", category: "Messaging", sync: "Webhook", acl: true },
  { logo: "teams", name: "Microsoft Teams", category: "Messaging", sync: "Webhook", acl: true },
  { logo: "gmail", name: "Gmail", category: "Messaging", sync: "Webhook", acl: true },
  { logo: "outlook", name: "Outlook", category: "Messaging", sync: "Webhook", acl: true },
  { logo: "discord", name: "Discord", category: "Messaging", sync: "Webhook", acl: true },
  { logo: "zoom", name: "Zoom", category: "Messaging", sync: "Poll", acl: true },
  { logo: "intercom", name: "Intercom", category: "Messaging", sync: "Webhook", acl: false },
  { logo: "email", name: "Email (IMAP)", category: "Messaging", sync: "Poll", acl: false },
  { logo: "googledrive", name: "Google Drive", category: "Storage", sync: "Webhook", acl: true },
  { logo: "onedrive", name: "OneDrive", category: "Storage", sync: "Webhook", acl: true },
  { logo: "dropbox", name: "Dropbox", category: "Storage", sync: "Webhook", acl: true },
  { logo: "box", name: "Box", category: "Storage", sync: "Webhook", acl: true },
  { logo: "s3", name: "Amazon S3", category: "Storage", sync: "Poll", acl: false },
  { logo: "sharepoint", name: "SharePoint", category: "Wiki & Docs", sync: "Webhook", acl: true },
  { logo: "confluence", name: "Confluence", category: "Wiki & Docs", sync: "Webhook", acl: true },
  { logo: "notion", name: "Notion", category: "Wiki & Docs", sync: "Poll", acl: true },
  { logo: "coda", name: "Coda", category: "Wiki & Docs", sync: "Poll", acl: true },
  { logo: "gitbook", name: "GitBook", category: "Wiki & Docs", sync: "Poll", acl: false },
  { logo: "outline", name: "Outline", category: "Wiki & Docs", sync: "Webhook", acl: true },
  { logo: "guru", name: "Guru", category: "Wiki & Docs", sync: "Poll", acl: true },
  {
    logo: "googlecalendar",
    name: "Google Calendar",
    category: "Wiki & Docs",
    sync: "Webhook",
    acl: true,
  },
  { logo: "jira", name: "Jira", category: "Tickets & Projects", sync: "Webhook", acl: true },
  { logo: "linear", name: "Linear", category: "Tickets & Projects", sync: "Webhook", acl: true },
  { logo: "asana", name: "Asana", category: "Tickets & Projects", sync: "Webhook", acl: true },
  { logo: "clickup", name: "ClickUp", category: "Tickets & Projects", sync: "Webhook", acl: true },
  { logo: "trello", name: "Trello", category: "Tickets & Projects", sync: "Webhook", acl: true },
  { logo: "airtable", name: "Airtable", category: "Tickets & Projects", sync: "Poll", acl: true },
  { logo: "zendesk", name: "Zendesk", category: "Tickets & Projects", sync: "Webhook", acl: true },
  { logo: "freshdesk", name: "Freshdesk", category: "Tickets & Projects", sync: "Poll", acl: true },
  {
    logo: "servicenow",
    name: "ServiceNow",
    category: "Tickets & Projects",
    sync: "Poll",
    acl: true,
  },
  { logo: "figma", name: "Figma", category: "Tickets & Projects", sync: "Poll", acl: true },
  { logo: "github", name: "GitHub", category: "Code", sync: "Webhook", acl: true },
  { logo: "gitlab", name: "GitLab", category: "Code", sync: "Webhook", acl: true },
  { logo: "bitbucket", name: "Bitbucket", category: "Code", sync: "Webhook", acl: true },
  { logo: "salesforce", name: "Salesforce", category: "Sales & CRM", sync: "Webhook", acl: true },
  { logo: "hubspot", name: "HubSpot", category: "Sales & CRM", sync: "Webhook", acl: true },
  { logo: "gong", name: "Gong", category: "Sales & CRM", sync: "Poll", acl: true },
  { logo: "web", name: "Website crawler", category: "Other", sync: "Poll", acl: false },
  { logo: "file", name: "File upload", category: "Other", sync: "Upload", acl: true },
  { logo: "postgres", name: "SQL database", category: "Other", sync: "Federated", acl: true },
  { logo: "custom", name: "Any MCP server", category: "Other", sync: "Federated", acl: true },
];

export type ModelProvider = {
  logo: string;
  name: string;
  models: string[];
  status: "connected" | "available";
  role: string;
};

export const modelProviders: ModelProvider[] = [
  {
    logo: "anthropic",
    name: "Anthropic",
    models: ["Claude Opus 5.5", "Claude Sonnet 5.5", "Claude Haiku 5.5"],
    status: "connected",
    role: "Default for answers, research and artifacts",
  },
  { logo: "openai", name: "OpenAI", models: ["GPT family"], status: "available", role: "Optional" },
  {
    logo: "googlegemini",
    name: "Google Gemini",
    models: ["Gemini family"],
    status: "available",
    role: "Optional",
  },
  {
    logo: "bedrock",
    name: "Amazon Bedrock",
    models: ["Claude via Bedrock"],
    status: "available",
    role: "VPC / data residency",
  },
  {
    logo: "mistralai",
    name: "Mistral AI",
    models: ["Mistral family"],
    status: "available",
    role: "Optional",
  },
  {
    logo: "ollama",
    name: "Ollama",
    models: ["Local open-weight models"],
    status: "connected",
    role: "Air-gapped router & rewrite",
  },
  {
    logo: "vllm",
    name: "vLLM",
    models: ["Self-hosted inference"],
    status: "available",
    role: "Self-hosted GPU cluster",
  },
];
