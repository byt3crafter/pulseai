"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";
import Markdown from "../../../components/dashboard/Markdown";
import { getChatTokenAction } from "./actions";

interface AgentOpt { id: string; name: string; avatar: string | null; title: string | null; }
type Msg = { role: "user" | "assistant"; content: string; streaming?: boolean };
type ConnState = "connecting" | "online" | "offline";

/**
 * Live streaming chat with the workspace agent — WhatsApp/Telegram-style.
 * Connects to the gateway WebSocket, streams the reply as it's generated, and
 * persists across reloads (server loads history; the same conversation the WS
 * writes to). Same agent brain as Telegram, in the browser.
 */
export default function AssistantClient({ agents, history }: { agents: AgentOpt[]; history: { role: string; content: string }[] }) {
    const [messages, setMessages] = useState<Msg[]>(
        history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content }))
    );
    const [input, setInput] = useState("");
    const [conn, setConn] = useState<ConnState>("connecting");
    const [busy, setBusy] = useState(false);
    const [agentId, setAgentId] = useState<string>(agents[0]?.id ?? "");
    const wsRef = useRef<WebSocket | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeAgent = agents.find((a) => a.id === agentId) ?? agents[0];

    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); });
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

    // Connect (and auto-reconnect) the WebSocket.
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
            if (m.type === "agent.streaming") {
                setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last && last.role === "assistant" && last.streaming) last.content = m.content;
                    else next.push({ role: "assistant", content: m.content, streaming: true });
                    return next;
                });
            } else if (m.type === "agent.message") {
                setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last && last.role === "assistant" && last.streaming) { last.content = m.content; last.streaming = false; }
                    else next.push({ role: "assistant", content: m.content });
                    return next;
                });
                setBusy(false);
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

    function send() {
        const text = input.trim();
        if (!text || busy || conn !== "online") return;
        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setInput("");
        setBusy(true);
        wsRef.current!.send(JSON.stringify({ type: "chat", text, agentProfileId: agentId || undefined }));
        scrollToBottom();
    }

    return (
        <div className="flex h-[calc(100vh-3.5rem)] flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-pulse-border-subtle bg-pulse-panel px-4 py-3 sm:px-6">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pulse-tint text-sm font-semibold text-pulse-accent-hi overflow-hidden">
                        {activeAgent?.avatar ? <img src={activeAgent.avatar} alt="" className="h-full w-full object-cover" /> : (activeAgent?.name?.[0] ?? "A")}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-pulse-text">{activeAgent?.name ?? "Assistant"}</p>
                        <p className="flex items-center gap-1.5 text-xs text-pulse-muted">
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${conn === "online" ? "bg-emerald-500" : conn === "connecting" ? "bg-amber-500 animate-pulse" : "bg-red-500"}`} />
                            {conn === "online" ? (activeAgent?.title || "Online") : conn === "connecting" ? "Connecting…" : "Reconnecting…"}
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
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-pulse-bg px-4 py-6 sm:px-6">
                {messages.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center text-center text-pulse-muted">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-pulse-tint text-lg font-semibold text-pulse-accent-hi">{activeAgent?.name?.[0] ?? "A"}</div>
                        <p className="text-sm font-medium text-pulse-text">Chat with {activeAgent?.name ?? "your assistant"}</p>
                        <p className="mt-1 max-w-sm text-xs">Ask anything. It has the same tools, memory, and approvals as on Telegram — right here in your browser.</p>
                    </div>
                )}
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm sm:max-w-[75%] ${m.role === "user" ? "bg-pulse-accent text-white rounded-br-md" : "bg-pulse-panel border border-pulse-border-subtle text-pulse-text rounded-bl-md"}`}>
                            {m.role === "assistant"
                                ? <div className="md-chat"><Markdown>{m.content || "…"}</Markdown>{m.streaming && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-pulse-accent align-middle" />}</div>
                                : <span className="whitespace-pre-wrap break-words">{m.content}</span>}
                        </div>
                    </div>
                ))}
                {busy && !messages.some((m) => m.streaming) && (
                    <div className="flex justify-start">
                        <div className="rounded-2xl rounded-bl-md border border-pulse-border-subtle bg-pulse-panel px-4 py-3">
                            <span className="flex gap-1">
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pulse-faint [animation-delay:-0.3s]" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pulse-faint [animation-delay:-0.15s]" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pulse-faint" />
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Composer */}
            <div className="border-t border-pulse-border-subtle bg-pulse-panel px-4 py-3 sm:px-6">
                <div className="flex items-end gap-2">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                        rows={1}
                        placeholder={conn === "online" ? "Message your assistant…" : "Connecting…"}
                        disabled={conn !== "online"}
                        className="max-h-40 min-h-[42px] flex-1 resize-none rounded-xl border border-pulse-border bg-pulse-bg px-3.5 py-2.5 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                    />
                    <button type="button" onClick={send} disabled={!input.trim() || busy || conn !== "online"} className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-pulse-accent text-white transition-colors hover:bg-pulse-accent-hi disabled:opacity-40">
                        <PaperAirplaneIcon className="h-5 w-5" />
                    </button>
                </div>
                <p className="mt-1.5 text-center text-[11px] text-pulse-faint">Enter to send · Shift+Enter for a new line</p>
            </div>
        </div>
    );
}
