export type Role = "admin" | "manager" | "member" | "client";

export type Member = {
  id: string;
  name: string;
  role: Role;
  title: string;
  email: string;
  avatar: string;
  workload: number;
  tasksOpen: number;
  tasksDone: number;
  hoursWeek: number;
};

export type Project = {
  id: string;
  name: string;
  client: string;
  status: "in-progress" | "completed" | "not-started" | "on-hold";
  progress: number;
  budget: number;
  spent: number;
  start: string;
  due: string;
  owner: string;
  members: string[];
  tag: string;
  description: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  projectId: string;
  assignee: string;
  status: "todo" | "in-progress" | "review" | "done";
  priority: "low" | "medium" | "high";
  due: string;
  bucket: "today" | "tomorrow";
  accent: "rose" | "slate" | "amber" | "violet" | "sky";
};

export type Invoice = {
  id: string;
  number: string;
  projectId: string;
  client: string;
  amount: number;
  status: "paid" | "not-paid" | "overdue" | "draft";
  issued: string;
  due: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  type: "deadline" | "meeting" | "review" | "launch";
  projectId: string;
};

export type TimeEntry = {
  id: string;
  memberId: string;
  projectId: string;
  task: string;
  date: string;
  hours: number;
  billable: boolean;
};

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  time: string;
  group: "Today" | "Yesterday" | "Earlier";
  read: boolean;
  kind: "task" | "invoice" | "mention" | "system";
};

export const members: Member[] = [
  {
    id: "u1",
    name: "Alina Verma",
    role: "admin",
    title: "Founder & Admin",
    email: "alina@enaz.studio",
    avatar: "AV",
    workload: 62,
    tasksOpen: 6,
    tasksDone: 41,
    hoursWeek: 34,
  },
  {
    id: "u2",
    name: "Marcus Hale",
    role: "manager",
    title: "Delivery Manager",
    email: "marcus@enaz.studio",
    avatar: "MH",
    workload: 81,
    tasksOpen: 11,
    tasksDone: 58,
    hoursWeek: 38,
  },
  {
    id: "u3",
    name: "Priya Nair",
    role: "member",
    title: "Product Designer",
    email: "priya@enaz.studio",
    avatar: "PN",
    workload: 74,
    tasksOpen: 9,
    tasksDone: 63,
    hoursWeek: 36,
  },
  {
    id: "u4",
    name: "Diego Santos",
    role: "member",
    title: "Frontend Engineer",
    email: "diego@enaz.studio",
    avatar: "DS",
    workload: 93,
    tasksOpen: 14,
    tasksDone: 77,
    hoursWeek: 41,
  },
  {
    id: "u5",
    name: "Lena Fischer",
    role: "member",
    title: "Backend Engineer",
    email: "lena@enaz.studio",
    avatar: "LF",
    workload: 55,
    tasksOpen: 5,
    tasksDone: 49,
    hoursWeek: 29,
  },
  {
    id: "u6",
    name: "Tom Whitaker",
    role: "client",
    title: "Client — BrightBridge",
    email: "tom@brightbridge.io",
    avatar: "TW",
    workload: 0,
    tasksOpen: 0,
    tasksDone: 0,
    hoursWeek: 0,
  },
];

export const projects: Project[] = [
  {
    id: "p1",
    name: "BrightBridge Website",
    client: "BrightBridge",
    status: "in-progress",
    progress: 68,
    budget: 48000,
    spent: 31200,
    start: "2026-06-02",
    due: "2026-10-14",
    owner: "u2",
    members: ["u2", "u3", "u4"],
    tag: "Web Design",
    description:
      "Design and ship a modern marketing website with a reusable component system and CMS-driven case studies.",
  },
  {
    id: "p2",
    name: "Github Dev Pipeline",
    client: "Internal",
    status: "in-progress",
    progress: 44,
    budget: 26000,
    spent: 11400,
    start: "2026-07-11",
    due: "2026-11-01",
    owner: "u2",
    members: ["u4", "u5"],
    tag: "Engineering",
    description:
      "Automate build, preview and release pipelines so every pull request ships a reviewable environment.",
  },
  {
    id: "p3",
    name: "Northwind Mobile App",
    client: "Northwind",
    status: "in-progress",
    progress: 31,
    budget: 72000,
    spent: 21800,
    start: "2026-08-04",
    due: "2027-01-20",
    owner: "u1",
    members: ["u1", "u3", "u5"],
    tag: "Mobile",
    description:
      "A cross-platform ordering app with offline support, loyalty rewards and live delivery tracking.",
  },
  {
    id: "p4",
    name: "Aster Brand Refresh",
    client: "Aster Labs",
    status: "completed",
    progress: 100,
    budget: 19000,
    spent: 18250,
    start: "2026-03-18",
    due: "2026-07-30",
    owner: "u3",
    members: ["u3", "u1"],
    tag: "Branding",
    description: "Complete visual identity refresh including logo, palette, motion language and guidelines.",
  },
  {
    id: "p5",
    name: "Helio Analytics Portal",
    client: "Helio",
    status: "not-started",
    progress: 0,
    budget: 54000,
    spent: 0,
    start: "2026-10-05",
    due: "2027-03-12",
    owner: "u2",
    members: ["u2", "u5"],
    tag: "Dashboard",
    description: "Self-serve analytics workspace with saved views, scheduled reports and role-scoped data.",
  },
  {
    id: "p6",
    name: "Kite Commerce Migration",
    client: "Kite",
    status: "on-hold",
    progress: 22,
    budget: 38000,
    spent: 9100,
    start: "2026-05-20",
    due: "2026-12-09",
    owner: "u1",
    members: ["u1", "u4"],
    tag: "Commerce",
    description: "Migrate a legacy storefront to a headless stack without losing SEO equity or order history.",
  },
];

export const tasks: Task[] = [
  {
    id: "t1",
    title: "BrightBridge — Website Design",
    description: "Design a framer website with modern templates and a flexible section library.",
    projectId: "p1",
    assignee: "u3",
    status: "in-progress",
    priority: "high",
    due: "2026-09-16",
    bucket: "today",
    accent: "rose",
  },
  {
    id: "t2",
    title: "Github — Upload Dev Files & Images",
    description: "Collaborate with developers to handle the SaaS project asset pipeline.",
    projectId: "p2",
    assignee: "u4",
    status: "in-progress",
    priority: "medium",
    due: "2026-09-16",
    bucket: "today",
    accent: "slate",
  },
  {
    id: "t3",
    title: "Dribbble — Publish Case Study",
    description: "Prepare shots, write the narrative and schedule the publish slot.",
    projectId: "p4",
    assignee: "u3",
    status: "review",
    priority: "low",
    due: "2026-09-16",
    bucket: "today",
    accent: "amber",
  },
  {
    id: "t4",
    title: "Northwind — Checkout Flow Spec",
    description: "Document the offline-first checkout states and error recovery paths.",
    projectId: "p3",
    assignee: "u1",
    status: "todo",
    priority: "high",
    due: "2026-09-17",
    bucket: "tomorrow",
    accent: "violet",
  },
  {
    id: "t5",
    title: "Helio — Kickoff Deck",
    description: "Assemble discovery findings and the proposed delivery timeline.",
    projectId: "p5",
    assignee: "u2",
    status: "todo",
    priority: "medium",
    due: "2026-09-17",
    bucket: "tomorrow",
    accent: "sky",
  },
  {
    id: "t6",
    title: "Kite — Catalog Data Audit",
    description: "Map legacy product attributes to the new schema and flag gaps.",
    projectId: "p6",
    assignee: "u5",
    status: "todo",
    priority: "medium",
    due: "2026-09-19",
    bucket: "tomorrow",
    accent: "slate",
  },
  {
    id: "t7",
    title: "BrightBridge — CMS Wiring",
    description: "Connect case study collections and preview mode.",
    projectId: "p1",
    assignee: "u4",
    status: "in-progress",
    priority: "high",
    due: "2026-09-21",
    bucket: "tomorrow",
    accent: "rose",
  },
  {
    id: "t8",
    title: "Northwind — Loyalty API",
    description: "Points accrual, tier rules and redemption endpoints.",
    projectId: "p3",
    assignee: "u5",
    status: "in-progress",
    priority: "high",
    due: "2026-09-24",
    bucket: "tomorrow",
    accent: "violet",
  },
  {
    id: "t9",
    title: "BrightBridge — Accessibility Pass",
    description: "Contrast, focus order and keyboard traps across all templates.",
    projectId: "p1",
    assignee: "u3",
    status: "review",
    priority: "medium",
    due: "2026-09-25",
    bucket: "tomorrow",
    accent: "sky",
  },
  {
    id: "t10",
    title: "Aster — Guidelines Handoff",
    description: "Final PDF, motion samples and asset archive delivered to the client.",
    projectId: "p4",
    assignee: "u3",
    status: "done",
    priority: "low",
    due: "2026-07-28",
    bucket: "today",
    accent: "amber",
  },
  {
    id: "t11",
    title: "Github — Preview Environments",
    description: "Spin up ephemeral environments per pull request.",
    projectId: "p2",
    assignee: "u4",
    status: "done",
    priority: "medium",
    due: "2026-08-30",
    bucket: "today",
    accent: "slate",
  },
  {
    id: "t12",
    title: "Northwind — Design QA",
    description: "Compare shipped screens against the design source of truth.",
    projectId: "p3",
    assignee: "u3",
    status: "todo",
    priority: "low",
    due: "2026-09-30",
    bucket: "tomorrow",
    accent: "violet",
  },
];

export const invoices: Invoice[] = [
  {
    id: "i1",
    number: "INV-2041",
    projectId: "p1",
    client: "BrightBridge",
    amount: 18300,
    status: "overdue",
    issued: "2026-07-28",
    due: "2026-08-27",
  },
  {
    id: "i2",
    number: "INV-2042",
    projectId: "p3",
    client: "Northwind",
    amount: 18340,
    status: "not-paid",
    issued: "2026-08-14",
    due: "2026-09-20",
  },
  {
    id: "i3",
    number: "INV-2043",
    projectId: "p4",
    client: "Aster Labs",
    amount: 9600,
    status: "paid",
    issued: "2026-07-02",
    due: "2026-07-24",
  },
  {
    id: "i4",
    number: "INV-2044",
    projectId: "p2",
    client: "Internal",
    amount: 6400,
    status: "paid",
    issued: "2026-08-01",
    due: "2026-08-22",
  },
  {
    id: "i5",
    number: "INV-2045",
    projectId: "p6",
    client: "Kite",
    amount: 12750,
    status: "draft",
    issued: "2026-09-05",
    due: "2026-10-05",
  },
  {
    id: "i6",
    number: "INV-2046",
    projectId: "p1",
    client: "BrightBridge",
    amount: 14200,
    status: "not-paid",
    issued: "2026-09-01",
    due: "2026-09-30",
  },
];

export const events: CalendarEvent[] = [
  { id: "e1", title: "BrightBridge design review", date: "2026-09-16", type: "review", projectId: "p1" },
  { id: "e2", title: "Northwind sprint planning", date: "2026-09-17", type: "meeting", projectId: "p3" },
  { id: "e3", title: "Github pipeline milestone", date: "2026-09-19", type: "deadline", projectId: "p2" },
  { id: "e4", title: "Kite stakeholder sync", date: "2026-09-22", type: "meeting", projectId: "p6" },
  { id: "e5", title: "BrightBridge staging launch", date: "2026-09-25", type: "launch", projectId: "p1" },
  { id: "e6", title: "Helio kickoff", date: "2026-09-28", type: "meeting", projectId: "p5" },
  { id: "e7", title: "Northwind API freeze", date: "2026-09-30", type: "deadline", projectId: "p3" },
  { id: "e8", title: "Monthly finance review", date: "2026-09-09", type: "review", projectId: "p1" },
];

export const timeEntries: TimeEntry[] = [
  { id: "h1", memberId: "u3", projectId: "p1", task: "Template library", date: "2026-09-14", hours: 6.5, billable: true },
  { id: "h2", memberId: "u4", projectId: "p1", task: "CMS wiring", date: "2026-09-14", hours: 7, billable: true },
  { id: "h3", memberId: "u5", projectId: "p3", task: "Loyalty API", date: "2026-09-15", hours: 5.5, billable: true },
  { id: "h4", memberId: "u4", projectId: "p2", task: "Preview envs", date: "2026-09-15", hours: 4, billable: false },
  { id: "h5", memberId: "u3", projectId: "p3", task: "Design QA", date: "2026-09-15", hours: 3, billable: true },
  { id: "h6", memberId: "u2", projectId: "p5", task: "Kickoff prep", date: "2026-09-16", hours: 2.5, billable: false },
  { id: "h7", memberId: "u1", projectId: "p6", task: "Catalog audit", date: "2026-09-16", hours: 4.5, billable: true },
  { id: "h8", memberId: "u5", projectId: "p3", task: "Schema migration", date: "2026-09-16", hours: 6, billable: true },
];

export const notifications: AppNotification[] = [
  {
    id: "n1",
    title: "Priya moved a task to Review",
    body: "BrightBridge — Accessibility Pass is ready for your review.",
    time: "18m ago",
    group: "Today",
    read: false,
    kind: "task",
  },
  {
    id: "n2",
    title: "Invoice INV-2041 is overdue",
    body: "BrightBridge has not settled USD 18,300 — 20 days past due.",
    time: "2h ago",
    group: "Today",
    read: false,
    kind: "invoice",
  },
  {
    id: "n3",
    title: "Marcus mentioned you",
    body: "\"Can you confirm the Northwind API freeze date?\"",
    time: "5h ago",
    group: "Today",
    read: true,
    kind: "mention",
  },
  {
    id: "n4",
    title: "Weekly report generated",
    body: "Your team logged 187 hours across 5 active projects.",
    time: "Yesterday, 18:04",
    group: "Yesterday",
    read: true,
    kind: "system",
  },
  {
    id: "n5",
    title: "Diego completed 3 tasks",
    body: "Github Dev Pipeline is now 44% complete.",
    time: "Yesterday, 11:20",
    group: "Yesterday",
    read: true,
    kind: "task",
  },
  {
    id: "n6",
    title: "Aster Labs paid INV-2043",
    body: "USD 9,600 received and reconciled.",
    time: "Sep 12",
    group: "Earlier",
    read: true,
    kind: "invoice",
  },
];

export const incomeExpense = [
  { month: "Jan", income: 18400, expense: 11200 },
  { month: "Feb", income: 21200, expense: 12900 },
  { month: "Mar", income: 19750, expense: 12100 },
  { month: "Apr", income: 24600, expense: 13290 },
  { month: "May", income: 22800, expense: 14500 },
  { month: "Jun", income: 26900, expense: 15100 },
  { month: "Jul", income: 25400, expense: 14800 },
  { month: "Aug", income: 29700, expense: 16400 },
  { month: "Sep", income: 31200, expense: 17250 },
];

export const completionTrend = [
  { week: "W1", planned: 24, completed: 19 },
  { week: "W2", planned: 28, completed: 26 },
  { week: "W3", planned: 31, completed: 24 },
  { week: "W4", planned: 26, completed: 25 },
  { week: "W5", planned: 34, completed: 30 },
  { week: "W6", planned: 30, completed: 29 },
  { week: "W7", planned: 36, completed: 33 },
  { week: "W8", planned: 32, completed: 31 },
];

export const weeklyHours = [
  { day: "Mon", hours: 32 },
  { day: "Tue", hours: 38 },
  { day: "Wed", hours: 41 },
  { day: "Thu", hours: 36 },
  { day: "Fri", hours: 29 },
  { day: "Sat", hours: 8 },
  { day: "Sun", hours: 3 },
];

export const currency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export const memberById = (id: string) => members.find((m) => m.id === id);
export const projectById = (id: string) => projects.find((p) => p.id === id);

export const statusLabel: Record<Project["status"], string> = {
  "in-progress": "In Progress",
  completed: "Completed",
  "not-started": "Not Started",
  "on-hold": "On Hold",
};

export const taskStatusLabel: Record<Task["status"], string> = {
  todo: "To Do",
  "in-progress": "In Progress",
  review: "In Review",
  done: "Done",
};
