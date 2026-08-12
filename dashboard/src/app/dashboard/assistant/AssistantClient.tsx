"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
    PaperAirplaneIcon, PlusIcon, ChevronDownIcon, ChevronRightIcon,
    SparklesIcon, TrashIcon, PencilSquareIcon, EllipsisVerticalIcon, MapPinIcon,
    ChevronDoubleLeftIcon, ChevronDoubleRightIcon,
} from "@heroicons/react/24/outline";
import Markdown from "../../../components/dashboard/Markdown";
import { getLiveModelsAction } from "../agents/actions";
import { getActiveProvidersAction } from "../agents/[id]/actions";
import {
    getChatTokenAction, listSessionsAction, getSessionHistoryAction,
    renameSessionAction, deleteSessionAction, pinSessionAction, type ChatSession,
} from "./actions";

interface AgentOpt { id: string; name: string; avatar: string | null; title: string | null; }
type Msg = { role: "user" | "assistant"; content: string; thinking?: string; streaming?: boolean };
type ConnState = "connecting" | "online" | "offline";

const REASONING_OPTS = [
    { id: "auto", label: "Auto" }, { id: "minimal", label: "Minimal" },
    { id: "low", label: "Low" }, { id: "medium", label: "Medium" }, { id: "high", label: "High" },
];

function newSessionId(): string {
    try { return crypto.randomUUID().replace(/-/g, "").slice(0, 20); }
    catch { return `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`; }
}

/**
 * Advanced assistant chat: collapsible session rail on the left, a centered
 * reading column, live token + reasoning streaming, and compact per-message
 * reasoning control. Everything is a saved setting — nothing hardcoded.
 */
export default function AssistantClient({
    agents, sessions: initialSessions, initialSessionId, initialHistory,
}: {
    agents: AgentOpt[];
    sessions: ChatSession[];
    initialSessionId: string;
    initialHistory: { role: string; content: string }[];
}) {
    const [messages, setMessages] = useState<Msg[]>(
        initialHistory.map((h) => ({ role: h.role as "user" | "assistant", content: h.content }))
    );
    const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);
    const [sessionId, setSessionId] = useState<string>(initialSessionId || newSessionId());
    const [input, setInput] = useState("");
    const [conn, setConn] = useState<ConnState>("connecting");
    const [busy, setBusy] = useState(false);
    const [agentId, setAgentId] = useState<string>(agents[0]?.id ?? "");
    // Pre-select an agent from ?agent=<id> when opened from a notification.
    useEffect(() => {
        const fromUrl = new URLSearchParams(window.location.search).get("agent");
        if (fromUrl && agents.some((a) => a.id === fromUrl)) setAgentId(fromUrl);
    }, [agents]);
    const [railOpen, setRailOpen] = useState(true);
    const [renaming, setRenaming] = useState<string | null>(null);
    const [renameText, setRenameText] = useState("");
    // Session row context menu (kebab) — one fixed-position menu anchored to the
    // clicked button, so it can't be clipped by the rail's overflow.
    const [menu, setMenu] = useState<{ sid: string; pinned: boolean; x: number; y: number } | null>(null);
    // Session pending deletion → shows the in-app confirm modal (no browser popup).
    const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);

    // Model picker — change the model on the fly. "" = the agent's own model.
    const [model, setModel] = useState<string>("");
    const [models, setModels] = useState<{ id: string; label: string; provider: string }[]>([]);

    // Persisted settings (nothing hardcoded).
    const [reasoning, setReasoning] = useState<string>("auto");
    const [showThinking, setShowThinking] = useState<boolean>(true);

    const wsRef = useRef<WebSocket | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionRef = useRef(sessionId);
    sessionRef.current = sessionId;

    const activeAgent = agents.find((a) => a.id === agentId) ?? agents[0];

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
                const flat = lists.flat().map((m) => ({ id: m.id, label: m.displayName || m.id, provider: m.provider }));
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
            if (m.type === "agent.thinking") {
                setMessages((prev) => upsertStreaming(prev, { thinking: m.content }));
            } else if (m.type === "agent.streaming") {
                setMessages((prev) => upsertStreaming(prev, { content: m.content }));
            } else if (m.type === "agent.message") {
                setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last && last.role === "assistant" && last.streaming) {
                        last.content = m.content;
                        if (m.thinking) last.thinking = m.thinking;
                        last.streaming = false;
                    } else {
                        next.push({ role: "assistant", content: m.content, thinking: m.thinking });
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
        if (last && last.role === "assistant" && last.streaming) {
            Object.assign(last, patch);
        } else {
            next.push({ role: "assistant", content: "", streaming: true, ...patch });
        }
        return next;
    }

    async function refreshSessions() {
        setSessions(await listSessionsAction());
    }

    // Grow the composer with its content, capped — keeps a single line vertically
    // centred and lets multi-line wrap without an inner scrollbar until it's tall.
    const autoGrow = useCallback(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }, []);

    function send() {
        const text = input.trim();
        if (!text || busy || conn !== "online") return;
        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setInput("");
        setBusy(true);
        wsRef.current!.send(JSON.stringify({
            type: "chat", text,
            agentProfileId: agentId || undefined,
            sessionId: sessionRef.current,
            reasoningEffort: reasoning,
            model: model || undefined,
        }));
        // Reset the box height and keep focus so the user can type again straight away.
        requestAnimationFrame(() => {
            const el = inputRef.current;
            if (el) { el.style.height = "auto"; el.focus(); }
        });
        scrollToBottom();
    }

    function startNewChat() {
        setSessionId(newSessionId());
        setMessages([]);
        setBusy(false);
        if (isMobile()) setRailOpen(false);
    }

    async function switchSession(sid: string) {
        if (isMobile()) setRailOpen(false);
        if (sid === sessionId) return;
        setSessionId(sid);
        setBusy(false);
        const hist = await getSessionHistoryAction(sid);
        setMessages(hist.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })));
    }

    async function doRename(sid: string) {
        const title = renameText.trim();
        setRenaming(null);
        if (!title) return;
        await renameSessionAction(sid, title);
        refreshSessions();
    }

    async function doPin(sid: string, pinned: boolean) {
        setMenu(null);
        // Optimistic: reflect immediately, then reconcile from the server.
        setSessions((prev) => prev.map((s) => (s.sessionId === sid ? { ...s, pinned } : s))
            .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt)));
        await pinSessionAction(sid, pinned);
        refreshSessions();
    }

    async function confirmDelete() {
        const target = deleteTarget;
        setDeleteTarget(null);
        if (!target) return;
        const sid = target.sessionId;
        setSessions((prev) => prev.filter((s) => s.sessionId !== sid)); // optimistic
        await deleteSessionAction(sid);
        setSessions(await listSessionsAction());
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

    const pinnedSessions = sessions.filter((s) => s.pinned);
    const recentSessions = sessions.filter((s) => !s.pinned);
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
            {/* Mobile backdrop when the rail is open as an overlay */}
            {railOpen && (
                <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setRailOpen(false)} aria-hidden="true" />
            )}
            {/* ── Session rail (docked on desktop, overlay on mobile) ── */}
            {railOpen && (
                <aside className="flex w-64 shrink-0 flex-col border-r border-pulse-border-subtle bg-pulse-panel max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-[82%] max-md:max-w-xs max-md:shadow-xl">
                    <div className="flex items-center gap-2 p-2.5">
                        <button
                            onClick={startNewChat}
                            className="flex flex-1 items-center gap-2 rounded-lg border border-pulse-border-subtle bg-pulse-bg px-3 py-2 text-sm font-medium text-pulse-text transition-colors hover:bg-pulse-hover"
                        >
                            <PlusIcon className="h-4 w-4" /> New chat
                        </button>
                        <button
                            onClick={() => setRailOpen(false)}
                            title="Hide sidebar"
                            className="rounded-lg border border-pulse-border-subtle bg-pulse-bg p-2 text-pulse-muted hover:bg-pulse-hover"
                        >
                            <ChevronDoubleLeftIcon className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 pb-2">
                        {sessions.length === 0 && <p className="px-2 py-2 text-xs text-pulse-faint">No chats yet.</p>}
                        {pinnedSessions.length > 0 && (
                            <>
                                <p className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-pulse-faint">
                                    <MapPinIcon className="h-3 w-3" /> Pinned
                                </p>
                                {pinnedSessions.map(renderRow)}
                            </>
                        )}
                        {recentSessions.length > 0 && (
                            <>
                                <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-pulse-faint">Recent</p>
                                {recentSessions.map(renderRow)}
                            </>
                        )}
                    </div>
                </aside>
            )}

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
                {/* Header */}
                <div className="flex items-center justify-between gap-2 border-b border-pulse-border-subtle bg-pulse-panel px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                        {!railOpen && (
                            <button onClick={() => setRailOpen(true)} title="Show sidebar" className="rounded-lg border border-pulse-border-subtle bg-pulse-bg p-2 text-pulse-muted hover:bg-pulse-hover">
                                <ChevronDoubleRightIcon className="h-4 w-4" />
                            </button>
                        )}
                        {!railOpen && (
                            <button onClick={startNewChat} title="New chat" className="rounded-lg border border-pulse-border-subtle bg-pulse-bg p-2 text-pulse-muted hover:bg-pulse-hover">
                                <PlusIcon className="h-4 w-4" />
                            </button>
                        )}
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pulse-tint text-xs font-semibold text-pulse-accent-hi overflow-hidden">
                            {activeAgent?.avatar ? <img src={activeAgent.avatar} alt="" className="h-full w-full object-cover" /> : (activeAgent?.name?.[0] ?? "A")}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-pulse-text">{activeAgent?.name ?? "Assistant"}</p>
                            <p className="flex items-center gap-1.5 text-[11px] text-pulse-muted">
                                <span className={`inline-block h-1.5 w-1.5 rounded-full ${conn === "online" ? "bg-emerald-500" : conn === "connecting" ? "bg-amber-500 animate-pulse" : "bg-red-500"}`} />
                                {conn === "online" ? "Online" : conn === "connecting" ? "Connecting…" : "Reconnecting…"}
                            </p>
                        </div>
                    </div>
                    {agents.length > 1 && (
                        <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="rounded-lg border border-pulse-border bg-pulse-panel px-2 py-1.5 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500">
                            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    )}
                </div>

                {/* Messages */}
                <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                    <div className="mx-auto w-full max-w-3xl space-y-6">
                        {messages.length === 0 && (
                            <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
                                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-pulse-tint text-xl font-semibold text-pulse-accent-hi overflow-hidden">
                                    {activeAgent?.avatar ? <img src={activeAgent.avatar} alt="" className="h-full w-full object-cover" /> : (activeAgent?.name?.[0] ?? "A")}
                                </div>
                                <p className="text-lg font-semibold text-pulse-text">Chat with {activeAgent?.name ?? "your assistant"}</p>
                                <p className="mt-1 max-w-sm text-sm text-pulse-muted">Same tools, memory and approvals as Telegram — right here in your browser.</p>
                            </div>
                        )}

                        {messages.map((m, i) => m.role === "user" ? (
                            <div key={i} className="flex justify-end">
                                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-pulse-accent px-4 py-2.5 text-sm text-white">
                                    <span className="whitespace-pre-wrap break-words">{m.content}</span>
                                </div>
                            </div>
                        ) : (
                            <div key={i} className="flex gap-3">
                                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pulse-tint text-xs font-semibold text-pulse-accent-hi overflow-hidden">
                                    {activeAgent?.avatar ? <img src={activeAgent.avatar} alt="" className="h-full w-full object-cover" /> : (activeAgent?.name?.[0] ?? "A")}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="mb-1 text-xs font-medium text-pulse-muted">{activeAgent?.name ?? "Assistant"}</p>
                                    {showThinking && m.thinking && (
                                        <ThinkingPanel text={m.thinking} streaming={!!m.streaming && !m.content} />
                                    )}
                                    <div className="md-chat text-sm leading-relaxed text-pulse-text">
                                        {m.content
                                            ? <Markdown>{m.content}</Markdown>
                                            : (!m.thinking && <TypingDots />)}
                                        {m.streaming && m.content && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-pulse-accent align-middle" />}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {busy && !messages.some((m) => m.streaming) && (
                            <div className="flex gap-3">
                                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pulse-tint text-xs font-semibold text-pulse-accent-hi">{activeAgent?.name?.[0] ?? "A"}</div>
                                <div className="flex-1"><TypingDots /></div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Composer */}
                <div className="shrink-0 border-t border-pulse-border-subtle bg-pulse-panel px-4 py-3 sm:px-6">
                    <div className="mx-auto w-full max-w-3xl">
                        <div className="flex items-end gap-2 rounded-2xl border border-pulse-border bg-pulse-bg px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => { setInput(e.target.value); autoGrow(); }}
                                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                                rows={1}
                                placeholder={conn === "online" ? "Message your assistant…" : "Connecting…"}
                                disabled={conn !== "online"}
                                className="block max-h-40 h-9 flex-1 resize-none self-center bg-transparent py-1.5 text-sm leading-6 text-pulse-text outline-none placeholder:text-pulse-faint disabled:opacity-60"
                            />
                            <button type="button" onClick={send} disabled={!input.trim() || busy || conn !== "online"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pulse-accent text-white transition-colors hover:bg-pulse-accent-hi disabled:opacity-40">
                                <PaperAirplaneIcon className="h-5 w-5" />
                            </button>
                        </div>
                        {/* Compact controls */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-pulse-faint">
                            {models.length > 0 && (
                                <label className="flex items-center gap-1">
                                    <span>Model</span>
                                    <select value={model} onChange={(e) => setModel(e.target.value)} title="Switch the model for this chat" className="max-w-[11rem] rounded border border-pulse-border-subtle bg-pulse-panel px-1 py-0.5 text-[11px] text-pulse-text-soft outline-none focus:ring-1 focus:ring-indigo-500">
                                        <option value="">Default ({activeAgent?.name ?? "agent"}&apos;s model)</option>
                                        {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                                    </select>
                                </label>
                            )}
                            <label className="flex items-center gap-1">
                                <SparklesIcon className="h-3 w-3" />
                                <span>Reasoning</span>
                                <select value={reasoning} onChange={(e) => setReasoning(e.target.value)} className="rounded border border-pulse-border-subtle bg-pulse-panel px-1 py-0.5 text-[11px] text-pulse-text-soft outline-none focus:ring-1 focus:ring-indigo-500">
                                    {REASONING_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                </select>
                            </label>
                            <label className="flex cursor-pointer select-none items-center gap-1">
                                <input type="checkbox" checked={showThinking} onChange={(e) => setShowThinking(e.target.checked)} className="h-3 w-3 rounded accent-indigo-600" />
                                Show thinking
                            </label>
                            <span className="ml-auto hidden sm:inline">Enter to send · Shift+Enter for a new line</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ThinkingPanel({ text, streaming }: { text: string; streaming: boolean }) {
    const [open, setOpen] = useState(false);
    const isOpen = open || streaming;
    return (
        <div className="mb-2 rounded-xl border border-pulse-border-subtle bg-pulse-panel-alt">
            <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-pulse-muted hover:text-pulse-text-soft">
                {isOpen ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
                <SparklesIcon className="h-3.5 w-3.5" />
                {streaming ? "Thinking…" : "Thought process"}
            </button>
            {isOpen && (
                <div className="max-h-64 overflow-y-auto border-t border-pulse-border-subtle px-3 py-2 text-xs leading-relaxed text-pulse-muted">
                    <span className="whitespace-pre-wrap break-words">{text}</span>
                </div>
            )}
        </div>
    );
}

function TypingDots() {
    return (
        <span className="inline-flex gap-1 py-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pulse-faint [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pulse-faint [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pulse-faint" />
        </span>
    );
}
