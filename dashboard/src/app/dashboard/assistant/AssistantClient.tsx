"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
    PlusIcon, ChevronDownIcon, ChevronRightIcon,
    SparklesIcon, TrashIcon, PencilSquareIcon, EllipsisVerticalIcon, MapPinIcon, EnvelopeIcon,
    ChevronDoubleLeftIcon, ChevronDoubleRightIcon, MicrophoneIcon, LightBulbIcon, ArrowUpIcon,
    MagnifyingGlassIcon, CheckIcon, XMarkIcon, PaperClipIcon, DocumentIcon,
} from "@heroicons/react/24/outline";
import Markdown from "../../../components/dashboard/Markdown";
import { getLiveModelsAction } from "../agents/actions";
import { getActiveProvidersAction } from "../agents/[id]/actions";
import {
    getChatTokenAction, listSessionsAction, getSessionHistoryAction, getInFlightRunAction,
    renameSessionAction, deleteSessionAction, pinSessionAction, type ChatSession,
} from "./actions";

interface AgentOpt { id: string; name: string; avatar: string | null; title: string | null; modelId?: string | null; }
type ToolStep = { name: string; label: string; phase: "start" | "done" | "error"; detail?: string; agentProfileId?: string };
type Attach = { id: string; name: string; mime: string; size: number; dataBase64: string; preview?: string };
type Msg = { role: "user" | "assistant"; content: string; thinking?: string; streaming?: boolean; steps?: ToolStep[]; agentProfileId?: string | null; model?: string; routeReason?: string; files?: { name: string; mime: string; preview?: string }[] };
type ConnState = "connecting" | "online" | "offline";

const REASONING_OPTS = [
    { id: "auto", label: "Auto" }, { id: "minimal", label: "Minimal" },
    { id: "low", label: "Low" }, { id: "medium", label: "Medium" }, { id: "high", label: "High" },
];

/*
 * How each provider is NAMED in the model picker, and the order its group
 * appears in. The list mixed every provider's models into one flat dump — you
 * could not tell Codex's real ChatGPT models from OpenRouter's `openai/…`
 * namespaced ones from MiniMax. Grouping by provider with a human name is the
 * fix. Anything not listed falls back to the raw provider id (still grouped,
 * just un-prettified) so a new provider never vanishes — it lands at the end.
 */
const PROVIDER_LABELS: Record<string, string> = {
    codex: "Codex — ChatGPT subscription",
    anthropic: "Anthropic (Claude)",
    openai: "OpenAI",
    minimax: "MiniMax",
    zai: "Z.ai (GLM)",
    google: "Google (Gemini)",
    groq: "Groq",
    openrouter: "OpenRouter",
};
const PROVIDER_ORDER = ["codex", "anthropic", "openai", "minimax", "zai", "google", "groq", "openrouter"];
const providerLabel = (id: string) => PROVIDER_LABELS[id] || id;
const providerRank = (id: string) => {
    const i = PROVIDER_ORDER.indexOf(id);
    return i === -1 ? PROVIDER_ORDER.length : i;
};

function newSessionId(): string {
    try { return crypto.randomUUID().replace(/-/g, "").slice(0, 20); }
    catch { return `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`; }
}

/** If the text @mentions one of the agents (loose name match — "@natalie" →
 *  "Natalie Harrington"), return that agent's id. Mirrors the gateway's matcher. */
function matchMentionedAgent(text: string, agents: AgentOpt[]): string | undefined {
    const tokens: string[] = [];
    const re = /@([\w-]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) tokens.push(m[1].toLowerCase());
    if (!tokens.length) return undefined;
    for (const a of agents) {
        const norm = a.name.toLowerCase().replace(/[^\w]/g, "");
        const first = a.name.toLowerCase().split(/[\s\-—]/)[0].replace(/[^\w]/g, "");
        if (tokens.some((t) => { const tk = t.replace(/[^\w]/g, ""); return !!tk && (norm === tk || first === tk || norm.startsWith(tk) || first.startsWith(tk)); })) return a.id;
    }
    return undefined;
}

/** Bucket a session by its last-activity date, for the Today / Yesterday / … groups. */
function dateBucket(iso: string): string {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "Older";
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (t >= startToday) return "Today";
    if (t >= startToday - 86_400_000) return "Yesterday";
    if (t >= startToday - 7 * 86_400_000) return "Previous 7 days";
    if (t >= startToday - 30 * 86_400_000) return "Previous 30 days";
    return "Older";
}
const BUCKET_ORDER = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"];

/**
 * Advanced assistant chat: collapsible session rail on the left, a centered
 * reading column, live token + reasoning streaming, and compact per-message
 * reasoning control. Everything is a saved setting — nothing hardcoded.
 */
/**
 * Openers for an empty conversation. Deliberately things this workspace can
 * actually do — a chip that suggests something the agent cannot do is worse
 * than no chip, because it reads as a promise.
 */
const SUGGESTIONS: { label: string; prompt: string; icon: typeof SparklesIcon }[] = [
    { label: "Check server health", prompt: "Check the health of my servers and tell me if anything needs attention.", icon: MapPinIcon },
    { label: "Draft a follow-up", prompt: "Draft a follow-up email to the last customer I spoke to.", icon: EnvelopeIcon },
    { label: "Summarize activity", prompt: "Summarise what the agents have done today.", icon: SparklesIcon },
    { label: "Check my inbox", prompt: "Check my inbox for anything unread and summarise what needs me.", icon: PencilSquareIcon },
];

export default function AssistantClient({
    agents, sessions: initialSessions, initialSessionId, initialHistory, showIdentityPref = false, voiceEnabled = false, chatMode = "separate", userName = "",
}: {
    agents: AgentOpt[];
    userName?: string;
    sessions: ChatSession[];
    initialSessionId: string;
    initialHistory: { role: string; content: string; agentProfileId?: string | null }[];
    showIdentityPref?: boolean;
    voiceEnabled?: boolean;
    chatMode?: "separate" | "shared";
}) {
    // "separate" = one thread per agent (never mixed); "shared" = a single team
    // room where @mention picks who answers.
    const shared = chatMode === "shared";
    // "Dovik Admin" / "dovik@runstate.mu" -> "Dovik". The greeting uses a first
    // name or nothing; "What should we get done, dovik@runstate.mu?" is worse
    // than no name at all.
    const firstName = (userName || "").trim().split(/[\s@.]+/)[0]?.replace(/^./, (c) => c.toUpperCase()) || "";
    // Claude/ChatGPT style: no avatar, no name for a single agent. Auto-show when
    // there's more than one agent (you need to know who's talking), or when the
    // workspace owner turned it on in Appearance settings.
    const showIdentity = shared || agents.length > 1 || showIdentityPref;
    const [messages, setMessages] = useState<Msg[]>(
        initialHistory.map((h) => ({ role: h.role as "user" | "assistant", content: h.content, agentProfileId: h.agentProfileId ?? null }))
    );
    const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);
    const [sessionId, setSessionId] = useState<string>(initialSessionId || newSessionId());
    const [input, setInput] = useState("");
    // @-mention autocomplete: when the user types "@…", offer the agent list.
    const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
    const [mentionIdx, setMentionIdx] = useState(0);
    // The last message the user sent — Esc in an empty composer restores it (undo
    // a mistaken send so it can be fixed and re-sent).
    const [lastSent, setLastSent] = useState("");
    const [conn, setConn] = useState<ConnState>("connecting");
    const [busy, setBusy] = useState(false);
    const [agentId, setAgentId] = useState<string>(agents[0]?.id ?? "");
    // Pre-select an agent from ?agent=<id> when opened from a notification.
    useEffect(() => {
        const fromUrl = new URLSearchParams(window.location.search).get("agent");
        if (fromUrl && agents.some((a) => a.id === fromUrl) && fromUrl !== agentId) void switchAgent(fromUrl);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agents]);
    const [railOpen, setRailOpen] = useState(true);
    const [renaming, setRenaming] = useState<string | null>(null);
    const [renameText, setRenameText] = useState("");
    // Session row context menu (kebab) — one fixed-position menu anchored to the
    // clicked button, so it can't be clipped by the rail's overflow.
    const [menu, setMenu] = useState<{ sid: string; pinned: boolean; x: number; y: number } | null>(null);
    // Session pending deletion → shows the in-app confirm modal (no browser popup).
    const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
    // Session list filter (the "Search" box in the rail).
    const [sessionQuery, setSessionQuery] = useState("");

    // ── Open tabs (browser-style multi-session) ──
    // Sessions you've opened this visit, shown as tabs above the thread. The
    // ACTIVE tab renders the live chat; background tabs keep running server-side
    // and light a "working" dot when their agent is active, so you can fan work
    // out across agents and switch between them. Persisted so tabs survive reload.
    type OpenTab = { sessionId: string; agentId: string; title: string };
    const [openTabs, setOpenTabs] = useState<OpenTab[]>(() => {
        try {
            const raw = localStorage.getItem("pulse_open_tabs");
            if (raw) { const t = JSON.parse(raw); if (Array.isArray(t) && t.length) return t; }
        } catch { }
        return [{ sessionId: initialSessionId || sessionId, agentId: agents[0]?.id ?? "", title: "" }];
    });
    // Per-session live "working" flag, driven by background ws frames.
    const [tabWorking, setTabWorking] = useState<Record<string, boolean>>({});
    const openTabsRef = useRef(openTabs);
    openTabsRef.current = openTabs;
    useEffect(() => { try { localStorage.setItem("pulse_open_tabs", JSON.stringify(openTabs.slice(0, 12))); } catch { } }, [openTabs]);

    // Model picker — change the model on the fly. "" = the agent's own model.
    const [model, setModel] = useState<string>("");
    const [models, setModels] = useState<{ id: string; label: string; provider: string; free?: boolean }[]>([]);
    const [freeOnly, setFreeOnly] = useState(false);
    // Search box inside the model picker — the list can be hundreds of models
    // (OpenRouter alone), so a filter is the difference between usable and not.
    const [modelQuery, setModelQuery] = useState("");

    // Persisted settings (nothing hardcoded).
    const [reasoning, setReasoning] = useState<string>("auto");
    const [showThinking, setShowThinking] = useState<boolean>(true);
    // The composer pill's menu (model / reasoning / thinking).
    const [pillOpen, setPillOpen] = useState(false);

    // Voice input — record → POST to /dashboard/assistant/transcribe → append text.
    const [recording, setRecording] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioStreamRef = useRef<MediaStream | null>(null);

    // File attachments staged in the composer (base64), sent with the next message.
    const [pendingFiles, setPendingFiles] = useState<Attach[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionRef = useRef(sessionId);
    sessionRef.current = sessionId;

    const activeAgent = agents.find((a) => a.id === agentId) ?? agents[0];
    const mentionMatches = mention
        ? agents.filter((a) => a.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6)
        : [];
    // Who to show as the sender of an assistant message. In the shared room a thread
    // holds replies from several agents, so attribute each message to the agent that
    // actually sent it; in separate mode the whole thread is the selected agent.
    const senderFor = (m: Msg) => (shared ? (agents.find((a) => a.id === m.agentProfileId) ?? activeAgent) : activeAgent);
    // Short, friendly label for the model that answered (smart-routing transparency).
    const modelLabel = (id?: string) => {
        if (!id) return "";
        const known = models.find((x) => x.id === id);
        if (known) return known.label;
        return id.replace(/^.*\//, "").replace(/-\d{6,8}$/, "");
    };
    /*
     * What the composer pill says it is thinking with.
     *
     * When no model is picked the agent uses its own, so the pill names THAT
     * rather than the word "Default" — which told you nothing about what was
     * about to answer you.
     */
    const agentModelName = modelLabel(activeAgent?.modelId ?? undefined);
    const pillModelName = model ? modelLabel(model) : agentModelName;

    /*
     * The picker list, filtered by the search box and grouped by provider.
     * Grouping is what lets you tell Codex from OpenRouter from MiniMax; the
     * search is what makes a hundreds-long list usable. Free-only is an extra
     * narrowing. Groups come out in PROVIDER_ORDER, models alphabetical within.
     */
    const modelGroups = (() => {
        const q = modelQuery.trim().toLowerCase();
        const filtered = models.filter((m) => {
            if (freeOnly && !m.free) return false;
            if (!q) return true;
            return m.id.toLowerCase().includes(q)
                || m.label.toLowerCase().includes(q)
                || providerLabel(m.provider).toLowerCase().includes(q);
        });
        const byProvider = new Map<string, typeof filtered>();
        for (const m of filtered) {
            const arr = byProvider.get(m.provider) ?? [];
            arr.push(m);
            byProvider.set(m.provider, arr);
        }
        return Array.from(byProvider.entries())
            .sort((a, b) => providerRank(a[0]) - providerRank(b[0]) || a[0].localeCompare(b[0]))
            .map(([provider, list]) => ({
                provider,
                label: providerLabel(provider),
                models: list.slice().sort((a, b) => a.label.localeCompare(b.label)),
            }));
    })();
    const modelResultCount = modelGroups.reduce((n, g) => n + g.models.length, 0);

    useEffect(() => {
        try {
            const r = localStorage.getItem("pulse_reasoning"); if (r) setReasoning(r);
            const t = localStorage.getItem("pulse_show_thinking"); if (t !== null) setShowThinking(t === "1");
            const rail = localStorage.getItem("pulse_rail_open"); if (rail !== null) setRailOpen(rail === "1");
        } catch { }
        // On phones the rail is an overlay — start closed so the chat is full-width.
        if (typeof window !== "undefined" && window.innerWidth < 768) setRailOpen(false);
    }, []);
    const isMobile = () => typeof window !== "undefined" && window.innerWidth < 768;
    useEffect(() => { try { localStorage.setItem("pulse_reasoning", reasoning); } catch { } }, [reasoning]);
    useEffect(() => { try { localStorage.setItem("pulse_show_thinking", showThinking ? "1" : "0"); } catch { } }, [showThinking]);
    useEffect(() => { try { const m = localStorage.getItem("pulse_assistant_model"); if (m) setModel(m); } catch { } }, []);
    useEffect(() => { try { localStorage.setItem("pulse_assistant_model", model); } catch { } }, [model]);

    // Load the models the tenant can pick (across connected providers) for the picker.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const providers = await getActiveProvidersAction();
                const lists = await Promise.all(providers.map((p) => getLiveModelsAction(p)));
                if (cancelled) return;
                const flat = lists.flat().map((m) => ({ id: m.id, label: m.displayName || m.id, provider: m.provider, free: (m as any).free === true }));
                // De-dup by id, keep provider order.
                const seen = new Set<string>();
                setModels(flat.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))));
            } catch { /* leave picker at Default only */ }
        })();
        return () => { cancelled = true; };
    }, []);
    useEffect(() => { try { localStorage.setItem("pulse_rail_open", railOpen ? "1" : "0"); } catch { } }, [railOpen]);

    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); });
    }, []);
    useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

    // ── WebSocket ──
    const connect = useCallback(async () => {
        setConn("connecting");
        const res = await getChatTokenAction();
        if (!res.ok) { setConn("offline"); return; }
        const proto = window.location.protocol === "https:" ? "wss" : "ws";
        const ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${encodeURIComponent(res.token)}`);
        wsRef.current = ws;
        ws.onopen = () => setConn("online");
        ws.onclose = () => {
            setConn("offline");
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            reconnectRef.current = setTimeout(() => connect(), 3000);
        };
        ws.onerror = () => ws.close();
        ws.onmessage = (ev) => {
            let m: any; try { m = JSON.parse(ev.data); } catch { return; }

            // Frames carry the session they belong to. A frame for a session other
            // than the active one is NOT rendered here — but if it's an OPEN TAB we
            // reflect its live "working" state so its tab shows the agent is busy in
            // the background, then stop.
            if (typeof m.sessionId === "string" && m.sessionId !== sessionRef.current) {
                const bg = m.sessionId;
                if (openTabsRef.current.some((t) => t.sessionId === bg)) {
                    if (m.type === "agent.message" || m.type === "error") {
                        setTabWorking((w) => ({ ...w, [bg]: false }));
                    } else if (m.type === "agent.tool" || m.type === "agent.thinking" || m.type === "agent.streaming") {
                        setTabWorking((w) => ({ ...w, [bg]: true }));
                    }
                }
                return;
            }

            // Resumed stream: output republished on the chat bus, which reaches
            // whatever socket this user currently has. This is what lets a browser
            // that navigated away (or reloaded) pick its own answer back up.
            if (m.type === "chat.stream" && m.event) {
                const e = m.event;
                // Bus events are keyed by contact id (`web-<tenant>-<agent>-<session>`).
                // The leading "-" makes the suffix test exact: "…-xabc" does not
                // match session "abc".
                const sid = sessionRef.current;
                if (sid && typeof e.contactId === "string" && !e.contactId.endsWith(`-${sid}`)) return;
                if (e.type === "chat:delta") {
                    setMessages((prev) => upsertStreaming(prev, {
                        content: e.content,
                        // Reasoning goes to the collapsible panel, never the answer.
                        ...(e.thinking ? { thinking: e.thinking } : {}),
                        agentProfileId: e.agentProfileId ?? undefined,
                    }));
                    setBusy(true);
                } else if (e.type === "chat:final") {
                    setMessages((prev) => {
                        const next = [...prev];
                        const last = next[next.length - 1];
                        if (last && last.role === "assistant" && last.streaming) {
                            last.content = e.content;
                            last.streaming = false;
                        } else if (!next.some((x) => x.role === "assistant" && x.content === e.content)) {
                            next.push({ role: "assistant", content: e.content, agentProfileId: e.agentProfileId ?? null });
                        }
                        return next;
                    });
                    setBusy(false);
                    void refreshSessions();
                }
                return;
            }

            if (m.type === "agent.thinking") {
                setMessages((prev) => upsertStreaming(prev, { thinking: m.content, agentProfileId: m.agentProfileId ?? undefined }));
            } else if (m.type === "agent.streaming") {
                setMessages((prev) => upsertStreaming(prev, { content: m.content, agentProfileId: m.agentProfileId ?? undefined }));
            } else if (m.type === "agent.tool") {
                setMessages((prev) => applyToolStep(prev, m as ToolStep));
            } else if (m.type === "agent.message") {
                setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    const sameAgent = !m.agentProfileId || !last?.agentProfileId || last.agentProfileId === m.agentProfileId;
                    if (last && last.role === "assistant" && last.streaming && sameAgent) {
                        last.content = m.content;
                        if (m.thinking) last.thinking = m.thinking;
                        if (m.agentProfileId) last.agentProfileId = m.agentProfileId;
                        if (m.model) last.model = m.model;
                        if (m.routeReason) last.routeReason = m.routeReason;
                        last.streaming = false;
                    } else {
                        next.push({ role: "assistant", content: m.content, thinking: m.thinking, agentProfileId: m.agentProfileId ?? null, model: m.model, routeReason: m.routeReason });
                    }
                    return next;
                });
                setBusy(false);
                void refreshSessions();
            } else if (m.type === "error") {
                setMessages((prev) => [...prev.filter((x) => !x.streaming), { role: "assistant", content: `⚠️ ${m.message}` }]);
                setBusy(false);
            }
        };
    }, []);

    useEffect(() => {
        connect();
        const ping = setInterval(() => { if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify({ type: "ping" })); }, 25000);
        return () => { clearInterval(ping); if (reconnectRef.current) clearTimeout(reconnectRef.current); wsRef.current?.close(); };
    }, [connect]);

    function upsertStreaming(prev: Msg[], patch: Partial<Msg>): Msg[] {
        const next = [...prev];
        const last = next[next.length - 1];
        // A reply from a DIFFERENT agent (meeting fan-out) starts its own bubble.
        const sameAgent = !patch.agentProfileId || !last?.agentProfileId || last.agentProfileId === patch.agentProfileId;
        if (last && last.role === "assistant" && last.streaming && sameAgent) {
            Object.assign(last, patch);
        } else {
            next.push({ role: "assistant", content: "", streaming: true, ...patch });
        }
        return next;
    }

    // Live tool-step events → the calm "step rows" on the current reply. A "start"
    // adds a running row; "done"/"error" flips the matching row's state.
    function applyToolStep(prev: Msg[], step: ToolStep): Msg[] {
        const next = [...prev];
        let last = next[next.length - 1];
        const sameAgent = !step.agentProfileId || !last?.agentProfileId || last.agentProfileId === step.agentProfileId;
        if (!(last && last.role === "assistant" && last.streaming && sameAgent)) {
            last = { role: "assistant", content: "", streaming: true, steps: [], agentProfileId: step.agentProfileId ?? null };
            next.push(last);
        }
        if (!last.steps) last.steps = [];
        if (step.phase === "start") {
            last.steps.push({ name: step.name, label: step.label, phase: "start", detail: step.detail });
        } else {
            for (let i = last.steps.length - 1; i >= 0; i--) {
                if (last.steps[i].name === step.name && last.steps[i].phase === "start") {
                    last.steps[i].phase = step.phase;
                    if (step.detail) last.steps[i].detail = step.detail;
                    break;
                }
            }
        }
        return next;
    }

    async function refreshSessions() {
        setSessions(await listSessionsAction(agentId, shared));
    }

    // Grow the composer with its content, capped — keeps a single line vertically
    // centred and lets multi-line wrap without an inner scrollbar until it's tall.
    const autoGrow = useCallback(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }, []);

    const MAX_FILE_BYTES = 20 * 1024 * 1024;
    function fileToBase64(f: File): Promise<string> {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => { const s = String(r.result); res(s.slice(s.indexOf(",") + 1)); };
            r.onerror = () => rej(new Error("read failed"));
            r.readAsDataURL(f);
        });
    }
    // Stage files for the next message. Audio is transcribed into the box (like the
    // mic) instead of attached; everything else is sent for the agent to read/see.
    async function addFiles(files: FileList | File[]) {
        setVoiceNotice(null);
        for (const f of Array.from(files)) {
            if (f.type.startsWith("audio/")) { void transcribeAndInsert(f); continue; }
            if (f.size > MAX_FILE_BYTES) { setVoiceNotice(`"${f.name}" is over 20 MB — skipped.`); continue; }
            try {
                const dataBase64 = await fileToBase64(f);
                const preview = f.type.startsWith("image/") ? `data:${f.type};base64,${dataBase64}` : undefined;
                const id = (crypto as any)?.randomUUID?.() ?? `f${Date.now()}${Math.random()}`;
                setPendingFiles((prev) => [...prev, { id, name: f.name, mime: f.type, size: f.size, dataBase64, preview }]);
            } catch { setVoiceNotice(`Couldn't read "${f.name}".`); }
        }
    }
    const removeFile = (id: string) => setPendingFiles((prev) => prev.filter((f) => f.id !== id));

    // Detect an "@partial" token just before the caret and offer matching agents.
    function refreshMention() {
        const el = inputRef.current;
        if (!el || agents.length < 2) { setMention(null); return; }
        const pos = el.selectionStart ?? el.value.length;
        const m = /(?:^|\s)@([\w-]*)$/.exec(el.value.slice(0, pos));
        if (m) { setMention({ query: m[1], start: pos - m[1].length - 1 }); setMentionIdx(0); }
        else setMention(null);
    }
    function pickMention(agent: AgentOpt) {
        if (!mention) return;
        const el = inputRef.current;
        const pos = el?.selectionStart ?? input.length;
        const before = input.slice(0, mention.start);
        const inserted = `@${agent.name} `;
        setInput(before + inserted + input.slice(pos));
        setMention(null);
        requestAnimationFrame(() => {
            const e2 = inputRef.current;
            if (e2) { const caret = before.length + inserted.length; e2.focus(); e2.setSelectionRange(caret, caret); autoGrow(); }
        });
    }

    async function send() {
        const text = input.trim();
        // Sending is allowed even while the agent is still responding — the box
        // is never blocked. Only a dropped connection stops a send.
        if ((!text && pendingFiles.length === 0) || conn !== "online") return;

        const mentioned = matchMentionedAgent(text, agents);
        let targetAgent = agentId;
        let targetSession = sessionRef.current;
        // Separate mode: an @mention to a DIFFERENT agent moves the aside into THAT
        // agent's own thread (a fresh chat there) so conversations never mix.
        if (!shared && mentioned && mentioned !== agentId) {
            targetAgent = mentioned;
            targetSession = newSessionId();
            setAgentId(mentioned);
            setSessionId(targetSession);
            setMessages([]);
            setSessions(await listSessionsAction(mentioned, false));
        }
        // Shared room: the @mentioned agent answers, else the selected one leads.
        const answerAgent = shared ? (mentioned || agentId) : targetAgent;

        // Make sure the session we're sending into is an open tab, and give a
        // brand-new tab a title from the first message (so it isn't just "New chat").
        setOpenTabs((prev) => {
            const short = text.slice(0, 44);
            const existing = prev.find((t) => t.sessionId === targetSession);
            if (!existing) return [...prev, { sessionId: targetSession, agentId: targetAgent, title: short }];
            if (!existing.title && short) return prev.map((t) => t.sessionId === targetSession ? { ...t, title: short } : t);
            return prev;
        });

        const files = pendingFiles;
        setLastSent(text);
        setMessages((prev) => [...prev, { role: "user", content: text, files: files.map((f) => ({ name: f.name, mime: f.mime, preview: f.preview })) }]);
        setInput("");
        setPendingFiles([]);
        setBusy(true);
        wsRef.current!.send(JSON.stringify({
            type: "chat", text,
            agentProfileId: answerAgent || undefined,
            sessionId: targetSession,
            shared,
            reasoningEffort: reasoning,
            model: model || undefined,
            attachments: files.map((f) => ({ name: f.name, mime: f.mime, dataBase64: f.dataBase64 })),
        }));
        // Reset the box height and keep focus so the user can type again straight away.
        requestAnimationFrame(() => {
            const el = inputRef.current;
            if (el) { el.style.height = "auto"; el.focus(); }
        });
        scrollToBottom();
    }

    // Stop the recorder (if any) and release the mic tracks.
    function stopMicStream() {
        audioStreamRef.current?.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
    }

    async function transcribeAndInsert(blob: Blob) {
        setTranscribing(true);
        setVoiceNotice(null);
        try {
            const form = new FormData();
            form.append("audio", blob, "audio.webm");
            const res = await fetch("/dashboard/assistant/transcribe", { method: "POST", body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.error) {
                setVoiceNotice(data?.error || "Couldn't transcribe the audio.");
                return;
            }
            const text = (data?.text || "").trim();
            if (text) {
                setInput((prev) => (prev.trim() ? `${prev} ${text}` : text));
                requestAnimationFrame(() => { inputRef.current?.focus(); autoGrow(); });
            }
        } catch {
            setVoiceNotice("Couldn't transcribe the audio.");
        } finally {
            setTranscribing(false);
        }
    }

    async function toggleRecording() {
        if (transcribing) return;
        if (recording) {
            mediaRecorderRef.current?.stop();
            return;
        }
        setVoiceNotice(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioStreamRef.current = stream;
            const recorder = new MediaRecorder(stream);
            audioChunksRef.current = [];
            recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            recorder.onstop = () => {
                stopMicStream();
                setRecording(false);
                const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                audioChunksRef.current = [];
                if (blob.size > 0) void transcribeAndInsert(blob);
            };
            mediaRecorderRef.current = recorder;
            recorder.start();
            setRecording(true);
        } catch {
            setVoiceNotice("Microphone access denied.");
            stopMicStream();
        }
    }

    // Release the mic if the component unmounts mid-recording.
    useEffect(() => () => stopMicStream(), []);

    function startNewChat() {
        const sid = newSessionId();
        setSessionId(sid);
        setMessages([]);
        setBusy(false);
        setOpenTabs((prev) => prev.some((t) => t.sessionId === sid) ? prev : [...prev, { sessionId: sid, agentId, title: "" }]);
        if (isMobile()) setRailOpen(false);
    }

    // Switch which agent you're talking to. In "separate" mode each agent has its
    // OWN chats, so we swap the session list to that agent's and RESUME its most
    // recent conversation (a fresh chat only if it has none) — histories never mix.
    // In "shared" mode there's one team thread list — the selector only changes who
    // answers by default, so the list stays put.
    async function switchAgent(id: string) {
        if (!id || id === agentId) return;
        setAgentId(id);
        if (shared) return;
        setBusy(false);
        const sess = await listSessionsAction(id, false);
        setSessions(sess);
        if (sess.length > 0) {
            const sid = sess[0].sessionId;
            setSessionId(sid);
            const hist = await getSessionHistoryAction(sid, id, false);
            setMessages(hist.map((h) => ({ role: h.role as "user" | "assistant", content: h.content, agentProfileId: h.agentProfileId ?? null })));
        } else {
            setSessionId(newSessionId());
            setMessages([]);
        }
    }

    /**
     * Re-attach to a run that is still going for this thread.
     *
     * The run never stopped when you navigated away — it finished server-side and
     * the reply was saved. What was missing was any way for the UI to know, so
     * you came back to an unlocked composer and no sign of life. This restores
     * the in-progress answer and locks the composer until it lands.
     */
    const reattach = useCallback(async (sid: string, agent: string, isShared: boolean) => {
        const live = await getInFlightRunAction(sid, agent, isShared);
        if (!live) return false;
        if (sessionRef.current !== sid) return false; // switched again while awaiting
        setBusy(true);
        if (live.partialContent) {
            setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "assistant" && last.streaming) {
                    last.content = live.partialContent;
                } else {
                    next.push({
                        role: "assistant",
                        content: live.partialContent,
                        streaming: true,
                        agentProfileId: live.agentProfileId ?? null,
                    });
                }
                return next;
            });
        }
        return true;
    }, []);

    // On first mount, pick up anything already running for the open thread.
    useEffect(() => {
        void reattach(sessionRef.current, agentId, shared);
        // Intentionally mount-only: session/agent switches call reattach directly.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function switchSession(sid: string) {
        if (isMobile()) setRailOpen(false);
        if (sid === sessionId) return;
        setSessionId(sid);
        setBusy(false);
        ensureTab(sid, agentId);
        setTabWorking((w) => ({ ...w, [sid]: false })); // it's now active — busy tracks it
        const hist = await getSessionHistoryAction(sid, agentId, shared);
        setMessages(hist.map((h) => ({ role: h.role as "user" | "assistant", content: h.content, agentProfileId: h.agentProfileId ?? null })));
        void reattach(sid, agentId, shared);
    }

    // The label a tab shows: the session's saved title, else "New chat".
    function tabTitle(t: OpenTab): string {
        if (t.title) return t.title;
        const s = sessions.find((x) => x.sessionId === t.sessionId);
        return (s?.title || "").trim() || "New chat";
    }
    // Add a session to the tab bar (no-op if already open).
    function ensureTab(sid: string, aid: string, title = "") {
        setOpenTabs((prev) => prev.some((t) => t.sessionId === sid) ? prev : [...prev, { sessionId: sid, agentId: aid, title }]);
    }
    // Close a tab (X) — removes it from the bar; the session itself is untouched.
    function closeTab(sid: string) {
        setTabWorking((w) => { const n = { ...w }; delete n[sid]; return n; });
        setOpenTabs((prev) => prev.filter((t) => t.sessionId !== sid));
        if (sid === sessionId) {
            const rest = openTabsRef.current.filter((t) => t.sessionId !== sid);
            if (rest.length > 0) void switchSession(rest[rest.length - 1].sessionId);
            else startNewChat();
        }
    }

    async function doRename(sid: string) {
        const title = renameText.trim();
        setRenaming(null);
        if (!title) return;
        await renameSessionAction(sid, title, agentId, shared);
        refreshSessions();
    }

    async function doPin(sid: string, pinned: boolean) {
        setMenu(null);
        // Optimistic: reflect immediately, then reconcile from the server.
        setSessions((prev) => prev.map((s) => (s.sessionId === sid ? { ...s, pinned } : s))
            .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt)));
        await pinSessionAction(sid, pinned, agentId, shared);
        refreshSessions();
    }

    async function confirmDelete() {
        const target = deleteTarget;
        setDeleteTarget(null);
        if (!target) return;
        const sid = target.sessionId;
        setSessions((prev) => prev.filter((s) => s.sessionId !== sid)); // optimistic
        await deleteSessionAction(sid, agentId, shared);
        setSessions(await listSessionsAction(agentId, shared));
        if (sid === sessionId) startNewChat();
    }

    // Escape closes the row menu / delete modal.
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") { setMenu(null); setDeleteTarget(null); }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const sq = sessionQuery.trim().toLowerCase();
    const filteredSessions = sq ? sessions.filter((s) => (s.title || "").toLowerCase().includes(sq)) : sessions;
    const pinnedSessions = filteredSessions.filter((s) => s.pinned);
    const recentSessions = filteredSessions.filter((s) => !s.pinned);
    // Group the un-pinned sessions into Today / Yesterday / … buckets (they're
    // already sorted newest-first, so each bucket stays in order).
    const recentGroups = BUCKET_ORDER
        .map((label) => ({ label, items: recentSessions.filter((s) => dateBucket(s.updatedAt) === label) }))
        .filter((g) => g.items.length > 0);
    const renderRow = (s: ChatSession) => (
        <div key={s.sessionId} className={`mb-0.5 flex items-center gap-1 rounded-lg px-1 ${s.sessionId === sessionId ? "bg-pulse-tint" : menu?.sid === s.sessionId ? "bg-pulse-hover" : "hover:bg-pulse-hover"}`}>
            {renaming === s.sessionId ? (
                <input
                    autoFocus value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") doRename(s.sessionId); if (e.key === "Escape") setRenaming(null); }}
                    onBlur={() => doRename(s.sessionId)}
                    className="my-1 w-full rounded-md border border-pulse-border bg-pulse-bg px-2 py-1 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500"
                />
            ) : (
                <>
                    <button onClick={() => switchSession(s.sessionId)} className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2 text-left">
                        {s.pinned && <MapPinIcon className="h-3.5 w-3.5 shrink-0 text-pulse-accent" />}
                        <span className={`truncate text-sm ${s.sessionId === sessionId ? "font-medium text-pulse-text" : "text-pulse-text-soft"}`}>{s.title}</span>
                    </button>
                    <button
                        onClick={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setMenu(menu?.sid === s.sessionId ? null : { sid: s.sessionId, pinned: s.pinned, x: r.right, y: r.bottom });
                        }}
                        title="Chat options" aria-label="Chat options"
                        className="shrink-0 rounded p-1.5 text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text"
                    >
                        <EllipsisVerticalIcon className="h-4 w-4" />
                    </button>
                </>
            )}
        </div>
    );

    return (
        <div className="flex h-full min-h-0 overflow-hidden bg-pulse-bg">

            {/* Session row context menu — fixed-position so the rail's overflow can't clip it */}
            {menu && (
                <>
                    <div className="fixed inset-0 z-50" onClick={() => setMenu(null)} aria-hidden="true" />
                    <div
                        className="fixed z-50 w-44 overflow-hidden rounded-lg border border-pulse-border bg-pulse-panel py-1 shadow-xl"
                        style={{ left: Math.max(8, menu.x - 176), top: menu.y + 4 }}
                    >
                        <button onClick={() => doPin(menu.sid, !menu.pinned)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-pulse-text hover:bg-pulse-hover">
                            <MapPinIcon className="h-4 w-4" /> {menu.pinned ? "Unpin" : "Pin to top"}
                        </button>
                        <button
                            onClick={() => { const t = sessions.find((x) => x.sessionId === menu.sid)?.title || ""; setRenaming(menu.sid); setRenameText(t); setMenu(null); }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-pulse-text hover:bg-pulse-hover"
                        >
                            <PencilSquareIcon className="h-4 w-4" /> Rename
                        </button>
                        <button
                            onClick={() => { const s = sessions.find((x) => x.sessionId === menu.sid) || null; setMenu(null); setDeleteTarget(s); }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
                        >
                            <TrashIcon className="h-4 w-4" /> Delete
                        </button>
                    </div>
                </>
            )}

            {/* Delete confirmation — in-app modal, not the browser's confirm() popup */}
            {deleteTarget && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setDeleteTarget(null)}>
                    <div className="w-full max-w-sm rounded-xl border border-pulse-border bg-pulse-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                        <h3 className="text-base font-semibold text-pulse-text">Delete chat?</h3>
                        <p className="mt-2 text-sm text-pulse-muted">
                            <span className="text-pulse-text-soft">&ldquo;{deleteTarget.title}&rdquo;</span> will be permanently deleted. This can&rsquo;t be undone.
                        </p>
                        <div className="mt-5 flex justify-end gap-2">
                            <button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-pulse-border px-3.5 py-2 text-sm font-medium text-pulse-text hover:bg-pulse-hover">Cancel</button>
                            <button onClick={confirmDelete} autoFocus className="rounded-lg bg-red-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-600">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Main ── */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {/* Open-session tabs — browser-style. Appears once you're in a
                    conversation (or have more than one session open); each tab lights a
                    dot while its agent is working in the background, so you can fan work
                    out across agents and switch between them. The "+ New" button is the
                    discoverable way to open a parallel session without leaving the page. */}
                {(openTabs.length >= 2 || (openTabs.length >= 1 && messages.length > 0)) && (
                    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-pulse-border-subtle bg-pulse-bg px-2 py-1.5">
                        {openTabs.map((t) => {
                            const active = t.sessionId === sessionId;
                            const working = active ? busy : !!tabWorking[t.sessionId];
                            const ag = agents.find((a) => a.id === t.agentId) ?? activeAgent;
                            return (
                                <div
                                    key={t.sessionId}
                                    onClick={() => switchSession(t.sessionId)}
                                    title={tabTitle(t)}
                                    className={`group flex min-w-0 max-w-[220px] shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors motion-reduce:transition-none ${active ? "bg-pulse-panel text-pulse-text shadow-sm" : "text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text-soft"}`}
                                >
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pulse-tint text-[10px] font-semibold text-pulse-accent-hi">{ag?.name?.[0] ?? "A"}</span>
                                    <span className="min-w-0 flex-1 truncate">{tabTitle(t)}</span>
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); closeTab(t.sessionId); }}
                                            aria-label="Close tab"
                                            className="hidden rounded p-0.5 text-pulse-faint hover:text-pulse-text group-hover:block"
                                        >
                                            <XMarkIcon className="h-3.5 w-3.5" />
                                        </button>
                                        {working && <span className="h-2 w-2 rounded-full bg-pulse-accent motion-safe:animate-pulse group-hover:hidden" aria-label="working" />}
                                    </span>
                                </div>
                            );
                        })}
                        <button type="button" onClick={startNewChat} aria-label="Open a new session" title="Open a new session" className="ml-1 flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-pulse-muted transition-colors hover:bg-pulse-hover hover:text-pulse-text">
                            <PlusIcon className="h-4 w-4" />
                            <span>New</span>
                        </button>
                    </div>
                )}
                <div ref={scrollRef} className={`min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 ${messages.length === 0 ? "hidden" : ""}`}>
                    <div className="mx-auto w-full max-w-4xl space-y-6">
                        {messages.map((m, i) => m.role === "user" ? (
                            <div key={i} className="flex flex-col items-end gap-1.5">
                                {m.files && m.files.length > 0 && (
                                    <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
                                        {m.files.map((f, k) => f.preview ? (
                                            <img key={k} src={f.preview} alt={f.name} className="h-20 w-20 rounded-lg border border-pulse-border-subtle object-cover" />
                                        ) : (
                                            <div key={k} className="flex items-center gap-2 rounded-lg border border-pulse-border-subtle bg-pulse-panel-alt px-2.5 py-1.5 text-xs text-pulse-text-soft">
                                                <DocumentIcon className="h-4 w-4 shrink-0 text-pulse-accent-hi" />
                                                <span className="max-w-[10rem] truncate" title={f.name}>{f.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {m.content && (
                                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-pulse-panel-alt px-4 py-2.5 text-[15px] leading-relaxed text-pulse-text">
                                        <span className="whitespace-pre-wrap break-words">{m.content}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div key={i} className="flex gap-3">
                                {showIdentity && (() => { const sender = senderFor(m); return (
                                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pulse-tint text-xs font-semibold text-pulse-accent-hi overflow-hidden">
                                        {sender?.avatar ? <img src={sender.avatar} alt="" className="h-full w-full object-cover" /> : (sender?.name?.[0] ?? "A")}
                                    </div>
                                ); })()}
                                <div className="min-w-0 flex-1">
                                    {(showIdentity || m.routeReason) && (
                                        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-pulse-muted">
                                            {showIdentity && <span>{senderFor(m)?.name ?? "Assistant"}</span>}
                                            {m.model && m.routeReason && (
                                                <span title={m.routeReason} className="rounded bg-pulse-tint px-1.5 py-0.5 text-[10px] font-normal text-pulse-faint">{modelLabel(m.model)}</span>
                                            )}
                                        </p>
                                    )}
                                    {m.steps && m.steps.length > 0 && <ToolSteps steps={m.steps} done={!m.streaming} />}
                                    {showThinking && m.thinking && (
                                        <ThinkingPanel text={m.thinking} streaming={!!m.streaming && !m.content} />
                                    )}
                                    <div className="md-chat text-sm leading-relaxed text-pulse-text">
                                        {m.content
                                            ? <Markdown>{m.content}</Markdown>
                                            : (!m.thinking && (!m.steps || m.steps.length === 0) && <TypingDots />)}
                                        {m.streaming && m.content && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-pulse-accent align-middle" />}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {busy && !messages.some((m) => m.streaming) && (
                            <div className="flex items-center gap-3">
                                {showIdentity && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pulse-tint text-xs font-semibold text-pulse-accent-hi">{activeAgent?.name?.[0] ?? "A"}</div>}
                                <div className="flex-1"><TypingDots /></div>
                            </div>
                        )}
                    </div>
                </div>

                {/*
                    Composer. On an empty conversation it sits in the middle of the
                    canvas under the greeting, and only drops to the bottom edge once
                    there is a conversation to sit under — which is the difference
                    between a page that invites you to start and one that looks like
                    an empty transcript.
                */}
                <div className={messages.length === 0
                    ? "flex min-h-0 flex-1 flex-col items-center justify-center px-4 sm:px-10"
                    : "shrink-0 bg-pulse-bg px-4 pb-5 pt-2 sm:px-6"}>
                    <div className={messages.length === 0
                        ? "-mt-12 flex w-full max-w-[760px] flex-col gap-[26px]"
                        : "mx-auto w-full max-w-4xl"}>
                        {messages.length === 0 && (
                            <div className="flex items-center justify-center gap-4">
                                <h1 className="text-center text-[24px] font-medium leading-tight tracking-[-0.02em] text-pulse-text sm:text-[32px]">
                                    What should we get done{firstName ? `, ${firstName}` : ""}?
                                </h1>
                                <SparklesIcon aria-hidden="true" className="hidden h-[34px] w-[34px] shrink-0 text-pulse-border-strong sm:block" />
                            </div>
                        )}
                        <div
                            onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
                            onDragLeave={(e) => { e.preventDefault(); if (e.currentTarget === e.target) setDragOver(false); }}
                            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer?.files?.length) void addFiles(e.dataTransfer.files); }}
                            className={`relative rounded-[18px] border bg-pulse-hover transition-colors ${dragOver ? "border-pulse-accent ring-2 ring-pulse-accent/30" : "border-pulse-border-strong focus-within:border-pulse-border-strong"}`}
                        >
                            {dragOver && (
                                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-pulse-panel/85 text-sm font-medium text-pulse-accent-hi">
                                    Drop files to attach
                                </div>
                            )}
                            <input ref={fileInputRef} type="file" multiple hidden
                                onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ""; }} />
                            {pendingFiles.length > 0 && (
                                <div className="flex flex-wrap gap-2 px-3 pt-3">
                                    {pendingFiles.map((f) => (
                                        <div key={f.id} className="group relative flex items-center gap-2 rounded-lg border border-pulse-border-subtle bg-pulse-panel-alt py-1.5 pl-1.5 pr-6 text-xs">
                                            {f.preview
                                                ? <img src={f.preview} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                                                : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-pulse-tint text-pulse-accent-hi"><DocumentIcon className="h-4 w-4" /></span>}
                                            <span className="max-w-[9rem] truncate text-pulse-text-soft" title={f.name}>{f.name}</span>
                                            <button type="button" onClick={() => removeFile(f.id)} aria-label={`Remove ${f.name}`}
                                                className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full text-pulse-faint hover:bg-pulse-hover hover:text-pulse-text">
                                                <XMarkIcon className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {mention && mentionMatches.length > 0 && (
                                <div className="absolute bottom-full left-3 z-30 mb-2 w-64 overflow-hidden rounded-xl border border-pulse-border bg-pulse-panel shadow-lg">
                                    <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-pulse-faint">Direct to agent</p>
                                    {mentionMatches.map((a, i) => (
                                        <button key={a.id} type="button" onMouseDown={(e) => { e.preventDefault(); pickMention(a); }}
                                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${i === mentionIdx ? "bg-pulse-tint text-pulse-accent-hi" : "text-pulse-text-soft hover:bg-pulse-hover"}`}>
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pulse-tint text-xs font-semibold text-pulse-accent-hi">
                                                {a.avatar ? <img src={a.avatar} alt="" className="h-full w-full object-cover" /> : (a.name[0] ?? "A")}
                                            </span>
                                            <span className="truncate">{a.name}</span>
                                            {a.title && <span className="ml-auto truncate text-xs text-pulse-faint">{a.title}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => { setInput(e.target.value); autoGrow(); refreshMention(); }}
                                onClick={refreshMention}
                                onKeyUp={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") refreshMention(); }}
                                onKeyDown={(e) => {
                                    // @-mention picker navigation takes priority over send.
                                    if (mention && mentionMatches.length > 0) {
                                        if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => Math.min(i + 1, mentionMatches.length - 1)); return; }
                                        if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx((i) => Math.max(i - 1, 0)); return; }
                                        if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(mentionMatches[mentionIdx]); return; }
                                        if (e.key === "Escape") { e.preventDefault(); setMention(null); return; }
                                    }
                                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                                    // Esc in an empty box brings back your last sent message to fix + resend.
                                    else if (e.key === "Escape" && !input.trim() && lastSent) {
                                        e.preventDefault();
                                        setInput(lastSent);
                                        requestAnimationFrame(() => { const el = inputRef.current; if (el) { el.focus(); autoGrow(); } });
                                    }
                                }}
                                onPaste={(e) => { const fs = Array.from(e.clipboardData?.files || []); if (fs.length) { e.preventDefault(); void addFiles(fs); } }}
                                rows={1}
                                placeholder={conn === "online" ? "Describe a task and let your agents do the rest" : "Connecting…"}
                                disabled={conn !== "online"}
                                className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1.5 text-[15px] leading-6 min-h-[78px] sm:min-h-[54px] max-h-44 text-pulse-text outline-none placeholder:text-pulse-faint disabled:opacity-60"
                            />
                            {/* bottom control bar — lives inside the box */}
                            <div className="flex flex-nowrap items-center gap-1.5 px-3 pb-3 sm:gap-2 sm:px-3.5 sm:pb-3.5">
                                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={conn !== "online"}
                                    title="Attach files (or drag & drop)" aria-label="Attach files"
                                    className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-pulse-muted transition-colors hover:bg-pulse-hover hover:text-pulse-text disabled:opacity-40">
                                    <PaperClipIcon className="h-[18px] w-[18px]" />
                                </button>
                                {voiceEnabled && (
                                    <button type="button" onClick={toggleRecording} disabled={transcribing || conn !== "online"}
                                        title={recording ? "Stop recording" : "Record voice message"} aria-label={recording ? "Stop recording" : "Record voice message"} aria-pressed={recording}
                                        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${recording ? "text-red-500 animate-pulse hover:bg-red-500/10" : "text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text"}`}>
                                        <MicrophoneIcon className="h-[18px] w-[18px]" />
                                    </button>
                                )}
                                <div className="flex-1" />
                                {/*
                                    One capsule, as v4 draws it: who answers, and what they think with.
                                    Model, reasoning and thinking used to be four controls sitting in a
                                    row — fine on a desktop, and on a phone they wrapped into three
                                    ragged lines that pushed Send out of reach. They live in this pill's
                                    menu now, which is also where the artboard's chevron implies they are.
                                */}
                                <div className="relative min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => setPillOpen((v) => !v)}
                                        aria-expanded={pillOpen}
                                        aria-haspopup="menu"
                                        className="flex h-[34px] min-w-0 shrink items-center gap-[7px] rounded-full bg-pulse-panel-alt pl-2.5 pr-1.5 sm:pl-3 sm:pr-2 text-[13px] text-pulse-text-soft transition-colors motion-reduce:transition-none hover:text-pulse-text cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50"
                                    >
                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pulse-accent" aria-hidden="true" />
                                        <span className="max-w-[9ch] truncate sm:max-w-none">{activeAgent?.name ?? "Assistant"}</span>
                                        <span className="hidden truncate text-pulse-faint sm:inline">{pillModelName}</span>
                                        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-pulse-faint" aria-hidden="true" />
                                    </button>
                                    {pillOpen && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setPillOpen(false)} aria-hidden="true" />
                                            <div role="menu" className="absolute bottom-[42px] left-0 z-50 w-[320px] rounded-xl border border-pulse-border-strong bg-pulse-hover p-3 shadow-2xl">
                                                <div className="flex items-center justify-between">
                                                    <label className="block text-[11px] font-medium uppercase tracking-wide text-pulse-dim">Model</label>
                                                    <button type="button" onClick={() => setFreeOnly((v) => !v)} aria-pressed={freeOnly}
                                                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${freeOnly ? "bg-pulse-accent/15 text-pulse-accent" : "text-pulse-faint hover:text-pulse-text-soft"}`}>
                                                        ✦ Free only
                                                    </button>
                                                </div>
                                                {/* search box — a flat list of hundreds is unusable without it */}
                                                <div className="relative mt-1.5">
                                                    <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-pulse-faint" />
                                                    <input
                                                        type="text" value={modelQuery} onChange={(e) => setModelQuery(e.target.value)}
                                                        placeholder="Search models or provider…" aria-label="Search models"
                                                        className="w-full rounded-lg border border-pulse-border bg-pulse-panel py-1.5 pl-8 pr-7 text-[13px] text-pulse-text outline-none placeholder:text-pulse-faint focus-visible:ring-2 focus-visible:ring-pulse-accent/50"
                                                    />
                                                    {modelQuery && (
                                                        <button type="button" onClick={() => setModelQuery("")} aria-label="Clear search"
                                                            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-pulse-faint hover:text-pulse-text">
                                                            <XMarkIcon className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                                {/* grouped, scrollable list */}
                                                <div role="listbox" className="mt-1.5 max-h-[240px] overflow-y-auto rounded-lg border border-pulse-border bg-pulse-panel">
                                                    <button type="button" role="option" aria-selected={model === ""}
                                                        onClick={() => { setModel(""); setPillOpen(false); }}
                                                        className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-pulse-hover ${model === "" ? "text-pulse-accent" : "text-pulse-text"}`}>
                                                        <span className="truncate">{agentModelName || "The agent's own model"}</span>
                                                        {model === "" && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
                                                    </button>
                                                    {modelGroups.map((g) => (
                                                        <div key={g.provider}>
                                                            <div className="sticky top-0 bg-pulse-panel px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-pulse-dim">{g.label}</div>
                                                            {g.models.map((m) => (
                                                                <button key={m.id} type="button" role="option" aria-selected={model === m.id}
                                                                    onClick={() => { setModel(m.id); setPillOpen(false); }}
                                                                    className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-pulse-hover ${model === m.id ? "text-pulse-accent" : "text-pulse-text"}`}>
                                                                    <span className="truncate">{m.label}{m.free ? "  ✦" : ""}</span>
                                                                    {model === m.id && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ))}
                                                    {modelResultCount === 0 && (
                                                        <p className="px-2.5 py-3 text-center text-[12px] text-pulse-faint">
                                                            {models.length === 0 ? "No models available yet." : "No models match your search."}
                                                        </p>
                                                    )}
                                                </div>
                                                <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-pulse-dim">Reasoning</label>
                                                <select value={reasoning} onChange={(e) => setReasoning(e.target.value)}
                                                    className="mt-1.5 w-full rounded-lg border border-pulse-border bg-pulse-panel px-2 py-1.5 text-[13px] text-pulse-text outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50">
                                                    {REASONING_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                                </select>
                                                <button type="button" onClick={() => setShowThinking((v) => !v)} aria-pressed={showThinking}
                                                    className="mt-3 flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-[13px] text-pulse-text-soft hover:text-pulse-text cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50">
                                                    <span className="flex items-center gap-2"><LightBulbIcon className="h-4 w-4 text-pulse-faint" />Show thinking</span>
                                                    <span className={`h-4 w-7 rounded-full transition-colors motion-reduce:transition-none ${showThinking ? "bg-pulse-accent" : "bg-pulse-border-strong"}`}>
                                                        <span className={`block h-3 w-3 translate-y-0.5 rounded-full bg-white transition-transform motion-reduce:transition-none ${showThinking ? "translate-x-3.5" : "translate-x-0.5"}`} />
                                                    </span>
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                                {/* v4 primary: a light pill, the brightest thing on the screen. */}
                                <button type="button" onClick={send} disabled={(!input.trim() && pendingFiles.length === 0) || conn !== "online"}
                                    className="flex shrink-0 items-center gap-[7px] rounded-full bg-pulse-primary px-4 py-2 text-[13px] font-semibold text-pulse-primary-fg transition-colors motion-reduce:transition-none hover:bg-pulse-primary-hover disabled:opacity-40 disabled:hover:bg-pulse-primary cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50">
                                    <ArrowUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                    Send
                                </button>
                            </div>
                        </div>
                        {(recording || transcribing || voiceNotice) && (
                            <p className="mt-1.5 px-1 text-[11px]">
                                {voiceNotice ? <span className="text-red-400">{voiceNotice}</span> : recording ? <span className="text-red-400">Listening…</span> : <span className="text-pulse-faint">Transcribing…</span>}
                            </p>
                        )}
                        {/*
                            Suggestion chips. Only on an empty conversation — once you
                            are talking they are noise, and they exist to answer "what
                            can I even ask this thing?", which stops being a question
                            after the first message.
                        */}
                        {messages.length === 0 && (
                            <div className="flex flex-wrap justify-center gap-2">
                                {SUGGESTIONS.map((sug) => (
                                    <button
                                        key={sug.label}
                                        type="button"
                                        onClick={() => { setInput(sug.prompt); requestAnimationFrame(() => { inputRef.current?.focus(); autoGrow(); }); }}
                                        className="flex cursor-pointer items-center gap-[7px] rounded-full bg-pulse-hover px-3.5 py-2 text-[13px] text-pulse-text-soft transition-colors motion-reduce:transition-none hover:bg-pulse-panel-alt hover:text-pulse-text outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50"
                                    >
                                        <sug.icon aria-hidden="true" className="h-[15px] w-[15px] shrink-0 text-pulse-faint" />
                                        {sug.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Calm live "step" rows: what the agent is doing (searching, reading, …) with a
 *  spinner while running and a check/cross when each step finishes. Consecutive
 *  identical steps collapse into one row with a ×N count (e.g. running a server
 *  command four times shows "Running a server command ×4"). */
function ToolSteps({ steps, done }: { steps: ToolStep[]; done?: boolean }) {
    type Group = { label: string; count: number; phase: "start" | "done" | "error"; detail?: string };
    const groups: Group[] = [];
    for (const s of steps) {
        // Once the message has finished, a step still marked "start" is really
        // done — some providers (Codex over MCP) only emit start events, so
        // without this the spinner would spin forever after the answer arrived.
        const phase = done && s.phase === "start" ? "done" : s.phase;
        const last = groups[groups.length - 1];
        if (last && last.label === s.label) {
            last.count += 1;
            // running wins; else an error sticks; otherwise done.
            if (phase === "start") last.phase = "start";
            else if (phase === "error" && last.phase !== "start") last.phase = "error";
            else if (last.phase !== "start" && last.phase !== "error") last.phase = "done";
            if (s.detail) last.detail = s.detail;
        } else {
            groups.push({ label: s.label, count: 1, phase, detail: s.detail });
        }
    }
    const [open, setOpen] = useState(false);
    const running = groups.some((g) => g.phase === "start");
    const anyError = groups.some((g) => g.phase === "error");
    const total = groups.reduce((n, g) => n + g.count, 0);
    // While working, show the live rows. Once every step is finished, collapse to
    // a one-line summary the user can expand.
    const showRows = running || open;
    const summary = anyError ? "Some steps didn't complete" : `Worked through ${total} step${total === 1 ? "" : "s"}`;

    return (
        <div className="mb-3 flex flex-col overflow-hidden rounded-xl border border-pulse-border-subtle bg-pulse-panel">
            {!running && (
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-pulse-muted transition-colors hover:bg-pulse-hover"
                >
                    {anyError
                        ? <XMarkIcon className="h-3.5 w-3.5 shrink-0 text-red-400" />
                        : <CheckIcon className="h-3.5 w-3.5 shrink-0 text-emerald-500" strokeWidth={2.5} />}
                    <span>{summary}</span>
                    <ChevronRightIcon className={`ml-auto h-3.5 w-3.5 text-pulse-faint transition-transform ${open ? "rotate-90" : ""}`} />
                </button>
            )}
            {showRows && groups.map((g, i) => (
                <div
                    key={i}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] ${(i > 0 || !running) ? "border-t border-pulse-border-subtle" : ""} ${g.phase === "start" ? "text-pulse-text-soft" : "text-pulse-muted"}`}
                >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                        {g.phase === "start" ? (
                            <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-pulse-border-strong border-t-pulse-accent motion-reduce:animate-none" aria-label="working" />
                        ) : g.phase === "error" ? (
                            <XMarkIcon className="h-3.5 w-3.5 text-red-400" />
                        ) : (
                            <CheckIcon className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.5} />
                        )}
                    </span>
                    <span>{g.label}{g.count > 1 && <span className="text-pulse-faint"> ×{g.count}</span>}</span>
                    {g.detail && g.count === 1 && <span className="text-pulse-faint">— {g.detail}</span>}
                </div>
            ))}
        </div>
    );
}

function ThinkingPanel({ text, streaming }: { text: string; streaming: boolean }) {
    // Collapsed by default — even while streaming — so the raw reasoning never
    // dumps itself onto the screen. The user expands it only if they want a peek.
    const [open, setOpen] = useState(false);
    const isOpen = open;
    return (
        <div className="mb-2 rounded-xl border border-pulse-border-subtle bg-pulse-panel-alt">
            <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-pulse-muted hover:text-pulse-text-soft">
                {isOpen ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
                <SparklesIcon className={`h-3.5 w-3.5 ${streaming ? "animate-pulse motion-reduce:animate-none" : ""}`} />
                <span className={streaming ? "animate-pulse motion-reduce:animate-none" : ""}>{streaming ? "Thinking…" : "Thought process"}</span>
            </button>
            {isOpen && (
                <div className="max-h-64 min-w-0 overflow-y-auto overflow-x-hidden border-t border-pulse-border-subtle px-3.5 py-2.5 text-xs leading-relaxed text-pulse-muted">
                    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text}</p>
                </div>
            )}
        </div>
    );
}

/**
 * The "thinking" state — a breathing accent orb next to a gradient shimmer that
 * sweeps across the status word. `label` reflects what the agent is actually
 * doing this instant ("Thinking", "Checking servers", "Searching the web") so
 * the wait feels alive and honest rather than a dead spinner.
 */
function TypingDots({ label = "Thinking" }: { label?: string }) {
    return (
        <span className="inline-flex items-center gap-2 py-1 align-middle">
            <span className="pulse-orb h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            <span className="pulse-shimmer-text text-[13px] font-medium tracking-tight">{label}…</span>
        </span>
    );
}
