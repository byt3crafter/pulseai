"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
    PaperAirplaneIcon, PlusIcon, ChevronDownIcon, ChevronRightIcon,
    SparklesIcon, TrashIcon, PencilSquareIcon,
    ChevronDoubleLeftIcon, ChevronDoubleRightIcon,
} from "@heroicons/react/24/outline";
import Markdown from "../../../components/dashboard/Markdown";
import {
    getChatTokenAction, listSessionsAction, getSessionHistoryAction,
    renameSessionAction, deleteSessionAction, type ChatSession,
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
    const [railOpen, setRailOpen] = useState(true);
    const [renaming, setRenaming] = useState<string | null>(null);
    const [renameText, setRenameText] = useState("");

    // Persisted settings (nothing hardcoded).
    const [reasoning, setReasoning] = useState<string>("auto");
    const [showThinking, setShowThinking] = useState<boolean>(true);

    const wsRef = useRef<WebSocket | null>(null);
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
    }, []);
    useEffect(() => { try { localStorage.setItem("pulse_reasoning", reasoning); } catch { } }, [reasoning]);
    useEffect(() => { try { localStorage.setItem("pulse_show_thinking", showThinking ? "1" : "0"); } catch { } }, [showThinking]);
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
        }));
        scrollToBottom();
    }

    function startNewChat() {
        setSessionId(newSessionId());
        setMessages([]);
        setBusy(false);
    }

    async function switchSession(sid: string) {
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

    async function doDelete(sid: string) {
        await deleteSessionAction(sid);
        setSessions(await listSessionsAction());
        if (sid === sessionId) startNewChat();
    }

    return (
        <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-pulse-bg">
            {/* ── Session rail ── */}
            {railOpen && (
                <aside className="flex w-64 shrink-0 flex-col border-r border-pulse-border-subtle bg-pulse-panel">
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
                        <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-pulse-faint">Recent</p>
                        {sessions.length === 0 && <p className="px-2 py-2 text-xs text-pulse-faint">No chats yet.</p>}
                        {sessions.map((s) => (
                            <div key={s.sessionId} className={`group mb-0.5 flex items-center gap-1 rounded-lg px-1 ${s.sessionId === sessionId ? "bg-pulse-tint" : "hover:bg-pulse-hover"}`}>
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
                                        <button onClick={() => switchSession(s.sessionId)} className="min-w-0 flex-1 px-2 py-2 text-left">
                                            <p className={`truncate text-sm ${s.sessionId === sessionId ? "font-medium text-pulse-text" : "text-pulse-text-soft"}`}>{s.title}</p>
                                        </button>
                                        <button onClick={() => { setRenaming(s.sessionId); setRenameText(s.title); }} title="Rename" className="hidden shrink-0 rounded p-1 text-pulse-muted hover:text-pulse-text group-hover:block">
                                            <PencilSquareIcon className="h-3.5 w-3.5" />
                                        </button>
                                        <button onClick={() => doDelete(s.sessionId)} title="Delete" className="hidden shrink-0 rounded p-1 text-pulse-muted hover:text-red-400 group-hover:block">
                                            <TrashIcon className="h-3.5 w-3.5" />
                                        </button>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </aside>
            )}

            {/* ── Main ── */}
            <div className="flex min-w-0 flex-1 flex-col">
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
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
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
                <div className="border-t border-pulse-border-subtle bg-pulse-panel px-4 py-3 sm:px-6">
                    <div className="mx-auto w-full max-w-3xl">
                        <div className="flex items-end gap-2 rounded-2xl border border-pulse-border bg-pulse-bg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                                rows={1}
                                placeholder={conn === "online" ? "Message your assistant…" : "Connecting…"}
                                disabled={conn !== "online"}
                                className="max-h-40 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-sm text-pulse-text outline-none placeholder:text-pulse-faint disabled:opacity-60"
                            />
                            <button type="button" onClick={send} disabled={!input.trim() || busy || conn !== "online"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pulse-accent text-white transition-colors hover:bg-pulse-accent-hi disabled:opacity-40">
                                <PaperAirplaneIcon className="h-5 w-5" />
                            </button>
                        </div>
                        {/* Compact controls */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-pulse-faint">
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
