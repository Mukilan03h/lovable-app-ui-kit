import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  Brain,
  Check,
  Copy,
  KeyRound,
  Laptop,
  MessageSquare,
  Mic,
  Moon,
  Palette,
  Plug,
  Plus,
  Slash,
  Sun,
  Trash2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Guard } from "@/components/app/Guard";
import { BrandLogo } from "@/components/app/BrandLogo";
import { Avatar, PageHeader, Pill } from "@/components/app/ui-bits";
import {
  SelectField,
  SettingRow,
  SettingsSection,
  Segmented,
  TextField,
  Toggle,
} from "@/components/app/settings-ui";
import { Slider } from "@/components/ui/slider";
import { api, type MemoryRow } from "@/lib/api";
import { PageTransition } from "@/lib/motion";
import { useAuth, roleLabel } from "@/lib/auth";
import { accents, useTheme, type ChatBackground, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import dunes from "@/assets/auth-dunes.jpg";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Enaz Knowledge" },
      {
        name: "description",
        content: "Profile, appearance, chat, memory, voice and account settings.",
      },
      { property: "og:title", content: "Settings — Enaz Knowledge" },
      { property: "og:description", content: "Personal settings for Enaz Knowledge." },
    ],
  }),
  component: () => (
    <Guard permission="settings" area="Settings">
      <SettingsPage />
    </Guard>
  ),
});

const tabs = [
  { id: "general", label: "General", icon: UserRound },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "personalization", label: "Memory", icon: Brain },
  { id: "shortcuts", label: "Prompt shortcuts", icon: Slash },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "accounts", label: "Connected accounts", icon: Plug },
  { id: "tokens", label: "Access tokens & MCP", icon: KeyRound },
  { id: "danger", label: "Danger zone", icon: TriangleAlert },
] as const;

type TabId = (typeof tabs)[number]["id"];

function SettingsPage() {
  const [tab, setTab] = useState<TabId>("general");

  return (
    <PageTransition className="space-y-6">
      <PageHeader eyebrow="Your preferences" title="Settings" />
      <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-muted-foreground",
                tab === t.id ? "text-foreground" : "hover:bg-muted",
                t.id === "danger" && "text-destructive",
              )}
            >
              {tab === t.id && (
                <motion.span
                  layoutId="settings-tab"
                  className="absolute inset-0 rounded-xl bg-muted"
                />
              )}
              <t.icon className="relative size-4" />
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </nav>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="min-w-0 space-y-5"
          >
            {tab === "general" && <General />}
            {tab === "appearance" && <Appearance />}
            {tab === "chat" && <ChatPrefs />}
            {tab === "personalization" && <Personalization />}
            {tab === "shortcuts" && <Shortcuts />}
            {tab === "voice" && <Voice />}
            {tab === "notifications" && <Notifications />}
            {tab === "accounts" && <Accounts />}
            {tab === "tokens" && <Tokens />}
            {tab === "danger" && <Danger />}
          </motion.div>
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}

function General() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [role, setRole] = useState("Product lead, Knowledge platform");
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("auto");
  return (
    <>
      <SettingsSection title="Profile" description="Used to personalize answers and agent outputs.">
        <SettingRow label="Photo">
          <div className="flex items-center gap-3">
            <Avatar initials={user?.avatar ?? "?"} className="size-12 text-sm" />
            <button className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
              Upload
            </button>
          </div>
        </SettingRow>
        <SettingRow label="Full name">
          <TextField value={name} onChange={setName} className="sm:w-72" />
        </SettingRow>
        <SettingRow
          label="Work role"
          description="Helps the assistant pick the right depth and vocabulary."
        >
          <TextField value={role} onChange={setRole} className="sm:w-72" />
        </SettingRow>
        <SettingRow label="Email">
          <span className="text-sm text-muted-foreground">{user?.email}</span>
        </SettingRow>
        <SettingRow label="Workspace role">
          <Pill tone="brand">{user ? roleLabel[user.role] : ""}</Pill>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title="Language & region">
        <SettingRow label="Display language" description="Answers follow the language you ask in.">
          <SelectField
            value={language}
            onChange={setLanguage}
            options={[
              { value: "en", label: "English" },
              { value: "es", label: "Español" },
              { value: "fr", label: "Français" },
              { value: "de", label: "Deutsch" },
              { value: "ja", label: "日本語" },
              { value: "zh", label: "中文" },
              { value: "ar", label: "العربية" },
              { value: "ta", label: "தமிழ்" },
              { value: "hi", label: "हिन्दी" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Time zone">
          <SelectField
            value={timezone}
            onChange={setTimezone}
            options={[
              { value: "auto", label: "Automatic" },
              { value: "utc", label: "UTC" },
              { value: "ist", label: "Asia/Kolkata" },
              { value: "pst", label: "America/Los_Angeles" },
              { value: "cet", label: "Europe/Berlin" },
            ]}
          />
        </SettingRow>
      </SettingsSection>
      <SaveBar />
    </>
  );
}

const backgrounds: { id: ChatBackground; label: string }[] = [
  { id: "none", label: "None" },
  { id: "aurora", label: "Aurora" },
  { id: "grid", label: "Grid" },
  { id: "dots", label: "Dots" },
  { id: "dunes", label: "Dunes" },
];

function Appearance() {
  const { mode, accent, textSize, chatBackground, reduceMotion, setPref } = useTheme();
  const modes: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Laptop },
  ];
  return (
    <>
      <SettingsSection title="Color mode" description="Changes apply instantly on this device.">
        <div className="grid grid-cols-3 gap-3 py-4">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setPref("mode", m.id)}
              className={cn(
                "overflow-hidden rounded-2xl border-2 text-left transition-colors",
                mode === m.id ? "border-brand" : "border-border hover:border-muted-foreground/40",
              )}
            >
              <ModePreview mode={m.id} />
              <span className="flex items-center gap-2 px-3 py-2 text-xs font-semibold">
                <m.icon className="size-3.5" /> {m.label}
                {mode === m.id && <Check className="ml-auto size-3.5 text-brand" />}
              </span>
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Accent color"
        description="Used for buttons, highlights and citations."
      >
        <div className="flex flex-wrap gap-3 py-4">
          {accents.map((a) => (
            <button
              key={a.id}
              onClick={() => setPref("accent", a.id)}
              className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground"
              aria-label={a.label}
            >
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-full ring-offset-2 ring-offset-card transition",
                  accent === a.id && "ring-2 ring-foreground",
                )}
                style={{ background: a.swatch }}
              >
                {accent === a.id && <Check className="size-4 text-white" />}
              </span>
              {a.label}
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Chat background">
        <div className="grid grid-cols-3 gap-3 py-4 sm:grid-cols-5">
          {backgrounds.map((b) => (
            <button
              key={b.id}
              onClick={() => setPref("chatBackground", b.id)}
              className={cn(
                "overflow-hidden rounded-2xl border-2 text-xs font-medium",
                chatBackground === b.id ? "border-brand" : "border-border",
              )}
            >
              <span
                className={cn(
                  "block aspect-video bg-background bg-cover bg-center",
                  b.id !== "none" && b.id !== "dunes" && `chat-bg-${b.id}`,
                )}
                style={b.id === "dunes" ? { backgroundImage: `url(${dunes})` } : undefined}
              />
              <span className="block px-2 py-1.5">{b.label}</span>
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Accessibility">
        <SettingRow label="Text size">
          <Segmented
            id="text-size"
            value={textSize}
            onChange={(v) => setPref("textSize", v)}
            options={[
              { value: "sm", label: "Small" },
              { value: "md", label: "Default" },
              { value: "lg", label: "Large" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Reduce motion" description="Turns off page and panel animations.">
          <Toggle
            label="Reduce motion"
            checked={reduceMotion}
            onChange={(v) => setPref("reduceMotion", v)}
          />
        </SettingRow>
      </SettingsSection>
    </>
  );
}

function ModePreview({ mode }: { mode: ThemeMode }) {
  const Pane = ({ dark }: { dark: boolean }) => (
    <span className={cn("flex h-full flex-1 gap-1.5 p-2", dark ? "bg-[#1d1b2e]" : "bg-[#f3f3f1]")}>
      <span className={cn("w-3 rounded", dark ? "bg-white/10" : "bg-black/10")} />
      <span className="flex flex-1 flex-col gap-1">
        <span className={cn("h-2 w-2/3 rounded", dark ? "bg-white/25" : "bg-black/20")} />
        <span className={cn("flex-1 rounded", dark ? "bg-white/10" : "bg-white")} />
        <span className="h-2 w-1/3 rounded bg-brand" />
      </span>
    </span>
  );
  return (
    <span className="flex aspect-[16/10]">
      {mode === "system" ? (
        <>
          <Pane dark={false} />
          <Pane dark />
        </>
      ) : (
        <Pane dark={mode === "dark"} />
      )}
    </span>
  );
}

function ChatPrefs() {
  const [defaultMode, setDefaultMode] = useState<"auto" | "quick" | "research" | "search">("auto");
  const [model, setModel] = useState("sonnet");
  const [effort, setEffort] = useState<"low" | "medium" | "high">("medium");
  const [temperature, setTemperature] = useState(0.3);
  const [flags, setFlags] = useState({
    autoScroll: true,
    smoothStreaming: true,
    collapsePastes: true,
    inlineCitations: true,
    showSteps: true,
    autoArtifacts: true,
    webSearch: false,
    followUps: true,
  });
  const flag = (k: keyof typeof flags) => ({
    checked: flags[k],
    onChange: (v: boolean) => setFlags((f) => ({ ...f, [k]: v })),
  });

  // Laya "System 1" fast-decision toggle — persisted to the backend so it
  // actually changes routing cost. Defaults to on (cheapest).
  const [laya, setLaya] = useState(true);
  const [loaded, setLoaded] = useState<Record<string, unknown>>({});
  useEffect(() => {
    api
      .settings()
      .then((r) => {
        setLoaded(r.settings ?? {});
        if (typeof r.settings?.["layaDecision"] === "boolean") {
          setLaya(r.settings["layaDecision"] as boolean);
        }
      })
      .catch(() => {});
  }, []);

  const saveChat = () =>
    api.saveSettings({
      ...loaded,
      layaDecision: laya,
      defaultMode,
      defaultModel: model,
      effort,
      temperature,
      ...flags,
    });

  return (
    <>
      <SettingsSection title="Defaults">
        <SettingRow label="Default mode" description="What a new chat starts in.">
          <Segmented
            id="default-mode"
            value={defaultMode}
            onChange={setDefaultMode}
            options={[
              { value: "auto", label: "Auto" },
              { value: "quick", label: "Quick" },
              { value: "research", label: "Research" },
              { value: "search", label: "Search only" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Default model">
          <SelectField
            value={model}
            onChange={setModel}
            options={[
              { value: "auto", label: "Automatic (router)" },
              { value: "opus", label: "Claude Opus 5.5" },
              { value: "sonnet", label: "Claude Sonnet 5.5" },
              { value: "haiku", label: "Claude Haiku 5.5" },
              { value: "local", label: "Local model (Ollama)" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Reasoning effort" description="Higher effort is slower and costs more.">
          <Segmented
            id="effort"
            value={effort}
            onChange={setEffort}
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Creativity" description={`Temperature ${temperature.toFixed(1)}`}>
          <Slider
            className="w-full sm:w-56"
            value={[temperature]}
            min={0}
            max={1}
            step={0.1}
            onValueChange={(v) => setTemperature(v[0] ?? 0)}
          />
        </SettingRow>
      </SettingsSection>
      <SettingsSection title="Answers">
        <SettingRow label="Inline citations" description="Numbered chips after each claim.">
          <Toggle label="Inline citations" {...flag("inlineCitations")} />
        </SettingRow>
        <SettingRow
          label="Show research steps"
          description="Live timeline of searches, reads and checks."
        >
          <Toggle label="Show research steps" {...flag("showSteps")} />
        </SettingRow>
        <SettingRow
          label="Suggest artifacts"
          description="Offer slides, docs or sheets when an answer fits."
        >
          <Toggle label="Suggest artifacts" {...flag("autoArtifacts")} />
        </SettingRow>
        <SettingRow label="Web search by default">
          <Toggle label="Web search" {...flag("webSearch")} />
        </SettingRow>
        <SettingRow label="Suggested follow-ups">
          <Toggle label="Follow-ups" {...flag("followUps")} />
        </SettingRow>
      </SettingsSection>
      <SettingsSection title="Behavior">
        <SettingRow label="Auto-scroll" description="Follow the answer while it streams.">
          <Toggle label="Auto-scroll" {...flag("autoScroll")} />
        </SettingRow>
        <SettingRow label="Smooth streaming">
          <Toggle label="Smooth streaming" {...flag("smoothStreaming")} />
        </SettingRow>
        <SettingRow
          label="Collapse large pastes"
          description="Long pasted text becomes an attachment tile."
        >
          <Toggle label="Collapse large pastes" {...flag("collapsePastes")} />
        </SettingRow>
      </SettingsSection>
      <SettingsSection title="Cost & performance">
        <SettingRow
          label="Laya fast decision (System 1)"
          description={
            laya
              ? "On — a zero-token heuristic routes each query. Cheapest and fastest; no model call to pick intent."
              : "Off — a small model classifies intent (System 2). Sharper routing on ambiguous queries, small extra cost per question."
          }
        >
          <Toggle label="Laya fast decision" checked={laya} onChange={setLaya} />
        </SettingRow>
      </SettingsSection>
      <SaveBar onSave={saveChat} />
    </>
  );
}

const memoryScopeMeta: Record<string, { label: string; tone: "brand" | "info" | "success" }> = {
  personal: { label: "Personal", tone: "brand" },
  agent: { label: "Agent", tone: "info" },
  shared: { label: "Shared", tone: "success" },
};
const memoryScopeOrder = ["personal", "agent", "shared"] as const;

function Personalization() {
  const [instructions, setInstructions] = useState(
    "Lead with the answer, then the evidence. Use tables for comparisons.",
  );
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState("");
  const [scope, setScope] = useState<"personal" | "shared">("personal");
  const [adding, setAdding] = useState(false);
  const [useMemory, setUseMemory] = useState(true);
  const [updateMemory, setUpdateMemory] = useState(true);

  const load = () => {
    setFailed(false);
    return api
      .memory()
      .then((r) => setMemories(r.memories))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      toast.error("Enter something to remember");
      return;
    }
    setAdding(true);
    try {
      await api.addMemory({ text: text.trim(), scope });
      setText("");
      toast.success("Memory saved");
      await load();
    } catch {
      toast.error("Couldn't save memory");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (m: MemoryRow) => {
    setMemories((all) => all.filter((x) => x.id !== m.id));
    try {
      await api.deleteMemory(m.id);
      toast.success("Memory forgotten");
    } catch {
      toast.error("Couldn't delete memory");
      await load();
    }
  };

  const groups = memoryScopeOrder
    .map((s) => ({ scope: s, items: memories.filter((m) => m.scope === s) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <SettingsSection title="Personal instructions" description="Added to every conversation.">
        <div className="py-4">
          <TextField value={instructions} onChange={setInstructions} multiline />
        </div>
      </SettingsSection>
      <SettingsSection
        title="Memory"
        description="What the assistant remembers about you. You can see and delete every item."
      >
        <SettingRow label="Use saved memories">
          <Toggle label="Use memories" checked={useMemory} onChange={setUseMemory} />
        </SettingRow>
        <SettingRow label="Learn new memories" description="Asks before saving anything sensitive.">
          <Toggle label="Learn memories" checked={updateMemory} onChange={setUpdateMemory} />
        </SettingRow>

        <SettingRow
          label="Add a memory"
          description="Personal memories are only for you; shared memories apply across your team."
          stack
        >
          <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Segmented
              id="memory-scope"
              value={scope}
              onChange={setScope}
              options={[
                { value: "personal", label: "Personal" },
                { value: "shared", label: "Shared" },
              ]}
            />
            <TextField value={text} onChange={setText} placeholder="Something to remember…" />
            <button
              disabled={adding}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Plus className="size-4" /> Add
            </button>
          </form>
        </SettingRow>

        <div className="py-3">
          {loading ? (
            <p className="py-2 text-sm text-muted-foreground">Loading memories…</p>
          ) : failed ? (
            <div className="flex items-center gap-2 py-2 text-sm text-destructive">
              <TriangleAlert className="size-4 shrink-0" />
              <span>Couldn't load memories.</span>
              <button onClick={() => void load()} className="ml-1 font-semibold underline">
                Retry
              </button>
            </div>
          ) : memories.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No memories saved.</p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => {
                const meta = memoryScopeMeta[g.scope] ?? { label: g.scope, tone: "info" as const };
                return (
                  <div key={g.scope}>
                    <div className="mb-1 flex items-center gap-2">
                      <Pill tone={meta.tone}>{meta.label}</Pill>
                      <span className="text-xs text-muted-foreground">
                        {g.items.length} item{g.items.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <ul>
                      <AnimatePresence initial={false}>
                        {g.items.map((m) => (
                          <motion.li
                            key={m.id}
                            layout
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex items-center gap-3 py-2 text-sm"
                          >
                            <Brain className="size-4 shrink-0 text-brand" />
                            <span className="flex-1">{m.text}</span>
                            <button
                              onClick={() => void remove(m)}
                              className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
                              aria-label="Forget memory"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SettingsSection>
      <SaveBar />
    </>
  );
}

function Shortcuts() {
  const [items, setItems] = useState([
    {
      cmd: "/summary",
      prompt: "Summarize this thread in 5 bullets with owners and dates",
      shared: true,
    },
    {
      cmd: "/deck",
      prompt: "Turn the last answer into a 6-slide deck using the brand template",
      shared: true,
    },
    { cmd: "/tldr", prompt: "One-paragraph TL;DR for an executive audience", shared: false },
  ]);
  const [cmd, setCmd] = useState("");
  const [prompt, setPrompt] = useState("");
  return (
    <SettingsSection
      title="Prompt shortcuts"
      description="Type / in the composer to insert a saved prompt."
    >
      <ul>
        {items.map((it) => (
          <li key={it.cmd} className="flex items-center gap-3 py-3">
            <code className="rounded-lg bg-muted px-2 py-1 text-xs font-semibold">{it.cmd}</code>
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {it.prompt}
            </span>
            {it.shared && <Pill>Team</Pill>}
            <button
              onClick={() => setItems((all) => all.filter((x) => x.cmd !== it.cmd))}
              className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
              aria-label="Delete shortcut"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!cmd.trim() || !prompt.trim()) {
            toast("Both fields are required");
            return;
          }
          setItems((all) => [
            ...all,
            { cmd: cmd.startsWith("/") ? cmd : `/${cmd}`, prompt, shared: false },
          ]);
          setCmd("");
          setPrompt("");
        }}
        className="flex flex-col gap-2 py-4 sm:flex-row"
      >
        <TextField value={cmd} onChange={setCmd} placeholder="/shortcut" className="sm:w-36" />
        <TextField value={prompt} onChange={setPrompt} placeholder="Prompt text" />
        <button className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          <Plus className="size-4" /> Add
        </button>
      </form>
    </SettingsSection>
  );
}

function Voice() {
  const [autoSend, setAutoSend] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [voice, setVoice] = useState("aria");
  return (
    <SettingsSection title="Voice" description="Speech-to-text input and read-aloud answers.">
      <SettingRow label="Voice">
        <SelectField
          value={voice}
          onChange={setVoice}
          options={[
            { value: "aria", label: "Aria — warm" },
            { value: "kai", label: "Kai — neutral" },
            { value: "noor", label: "Noor — bright" },
          ]}
        />
      </SettingRow>
      <SettingRow label="Auto-send after speaking" description="Sends when you stop talking.">
        <Toggle label="Auto-send" checked={autoSend} onChange={setAutoSend} />
      </SettingRow>
      <SettingRow label="Read answers aloud">
        <Toggle label="Auto-play" checked={autoPlay} onChange={setAutoPlay} />
      </SettingRow>
      <SettingRow label="Playback speed" description={`${speed.toFixed(2)}×`}>
        <Slider
          className="w-full sm:w-56"
          value={[speed]}
          min={0.5}
          max={2}
          step={0.25}
          onValueChange={(v) => setSpeed(v[0] ?? 1)}
        />
      </SettingRow>
    </SettingsSection>
  );
}

function Notifications() {
  const [n, setN] = useState({
    agentDone: true,
    approvals: true,
    gaps: false,
    digest: true,
    email: false,
    slack: true,
  });
  const t = (k: keyof typeof n, label: string, description?: string) => (
    <SettingRow label={label} {...(description ? { description } : {})}>
      <Toggle label={label} checked={n[k]} onChange={(v) => setN((s) => ({ ...s, [k]: v }))} />
    </SettingRow>
  );
  return (
    <>
      <SettingsSection title="Notify me when">
        {t("agentDone", "An agent run finishes")}
        {t("approvals", "An agent needs my approval", "Side-effect actions wait for you.")}
        {t("gaps", "My docs are flagged stale or contradicting")}
        {t("digest", "Weekly digest is ready")}
      </SettingsSection>
      <SettingsSection title="Delivery">
        {t("slack", "Slack direct message")}
        {t("email", "Email")}
      </SettingsSection>
    </>
  );
}

function Accounts() {
  const [linked, setLinked] = useState<Record<string, boolean>>({
    googledrive: true,
    gmail: true,
    slack: true,
    github: false,
    notion: false,
    outlook: false,
    linear: false,
  });
  const names: Record<string, string> = {
    googledrive: "Google Drive",
    gmail: "Gmail",
    slack: "Slack",
    github: "GitHub",
    notion: "Notion",
    outlook: "Outlook",
    linear: "Linear",
  };
  return (
    <SettingsSection
      title="Connected accounts"
      description="Personal connections let agents act as you and search your private files."
    >
      {Object.keys(linked).map((id) => (
        <div key={id} className="flex items-center gap-3 py-3">
          <BrandLogo id={id} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{names[id]}</p>
            <p className="text-xs text-muted-foreground">
              {linked[id] ? "Connected" : "Not connected"}
            </p>
          </div>
          <button
            onClick={() => {
              setLinked((l) => ({ ...l, [id]: !l[id] }));
              toast(linked[id] ? `Disconnected ${names[id]}` : `Connected ${names[id]}`);
            }}
            className={cn(
              "rounded-xl px-3 py-1.5 text-xs font-semibold",
              linked[id]
                ? "border border-border hover:bg-muted"
                : "bg-primary text-primary-foreground",
            )}
          >
            {linked[id] ? "Disconnect" : "Connect"}
          </button>
        </div>
      ))}
    </SettingsSection>
  );
}

function Tokens() {
  const mcpUrl = "https://enaz.example.com/mcp";
  const [tokens, setTokens] = useState([
    { name: "Claude Code", scope: "Search (read-only)", created: "Sep 12", expires: "Never" },
    { name: "CI bot", scope: "Agents: run", created: "Aug 30", expires: "Dec 31" },
  ]);
  return (
    <>
      <SettingsSection
        title="MCP server"
        description="Point Claude Code, Claude Desktop or any MCP client at Enaz. Results respect your permissions."
      >
        <div className="flex items-center gap-2 py-4">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-muted px-3 py-2 text-xs">
            {mcpUrl}
          </code>
          <button
            onClick={() => toast("MCP URL copied")}
            className="grid size-9 place-items-center rounded-xl border border-border hover:bg-muted"
            aria-label="Copy MCP URL"
          >
            <Copy className="size-4" />
          </button>
        </div>
      </SettingsSection>
      <SettingsSection
        title="Personal access tokens"
        action={
          <button
            onClick={() => {
              setTokens((t) => [
                ...t,
                {
                  name: `Token ${t.length + 1}`,
                  scope: "Search (read-only)",
                  created: "Today",
                  expires: "90 days",
                },
              ]);
              toast("Token created", { description: "Copy it now — it won't be shown again." });
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="size-3.5" /> New token
          </button>
        }
      >
        {tokens.map((t) => (
          <div key={t.name} className="flex flex-wrap items-center gap-3 py-3">
            <KeyRound className="size-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.name}</p>
              <p className="text-xs text-muted-foreground">
                {t.scope} · created {t.created} · expires {t.expires}
              </p>
            </div>
            <button
              onClick={() => setTokens((all) => all.filter((x) => x.name !== t.name))}
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
            >
              Revoke
            </button>
          </div>
        ))}
      </SettingsSection>
    </>
  );
}

function Danger() {
  return (
    <SettingsSection title="Danger zone">
      <SettingRow label="Export my data" description="Chats, artifacts and memories as a ZIP.">
        <button
          onClick={() =>
            toast("Export started", { description: "You'll get a download link by email." })
          }
          className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
        >
          Export
        </button>
      </SettingRow>
      <SettingRow
        label="Delete all chats"
        description="Artifacts you shared stay available to others."
      >
        <button
          onClick={() => toast("All chats deleted")}
          className="rounded-xl bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground"
        >
          Delete all chats
        </button>
      </SettingRow>
      <SettingRow label="Forget all memories">
        <button
          onClick={() => toast("Memories cleared")}
          className="rounded-xl border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
        >
          Forget everything
        </button>
      </SettingRow>
    </SettingsSection>
  );
}

function SaveBar({ onSave }: { onSave?: () => void | Promise<unknown> }) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex justify-end">
      <button
        disabled={saving}
        onClick={async () => {
          if (!onSave) {
            toast("Settings saved");
            return;
          }
          setSaving(true);
          try {
            await onSave();
            toast("Settings saved");
          } catch {
            toast.error("Couldn't save settings");
          } finally {
            setSaving(false);
          }
        }}
        className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
