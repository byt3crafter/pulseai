"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
    ChatBubbleLeftRightIcon,
    CommandLineIcon,
    EnvelopeIcon,
    GlobeAltIcon,
    InboxIcon,
    MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { PageHeader, Card, EmptyState, Toggle } from "../../../components/dashboard/ui";
import AgentAvatar from "../../../components/dashboard/AgentAvatar";
import { humanizeChannel, isSystemConversation, relativeTime, secondaryChannelLabel } from "./utils";

interface Conversation {
    id: string;
    channelType: string;
    channelContactId: string;
    contactName: string | null;
    status: string | null;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
}

/** Icon + accent color per channel — same bg/10 + text/border-30 pill formula used for status chips elsewhere. */
const CHANNEL_META: Record<string, { icon: typeof GlobeAltIcon; bg: string; text: string; border: string }> = {
    telegram: { icon: ChatBubbleLeftRightIcon, bg: "bg-sky-500/10", text: "text-sky-400", border: "border-sky-500/30" },
    webapp: { icon: GlobeAltIcon, bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/30" },
    webchat: { icon: GlobeAltIcon, bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/30" },
    email: { icon: EnvelopeIcon, bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
    mcp: { icon: CommandLineIcon, bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
};

function channelMeta(channelType: string) {
    return (
        CHANNEL_META[channelType] ?? {
            icon: ChatBubbleLeftRightIcon,
            bg: "bg-pulse-panel-alt",
            text: "text-pulse-muted",
            border: "border-pulse-border-subtle",
        }
    );
}

function ChannelChip({ channelType }: { channelType: string }) {
    const meta = channelMeta(channelType);
    const Icon = meta.icon;
    return (
        <span
            className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.bg} ${meta.text} ${meta.border}`}
        >
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            {humanizeChannel(channelType)}
        </span>
    );
}

function StatusDot({ status }: { status: string | null }) {
    const active = status === "active";
    return (
        <span
            className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${active ? "bg-green-500" : "bg-pulse-border-strong"}`}
            title={active ? "Active" : status || "Inactive"}
        >
            <span className="sr-only">{active ? "Active" : status || "Inactive"}</span>
        </span>
    );
}

export default function ConversationsClient({
    conversations,
}: {
    conversations: Conversation[];
}) {
    const [search, setSearch] = useState("");
    const [channelFilter, setChannelFilter] = useState<string>("all");
    const [showSystem, setShowSystem] = useState(false);

    const systemCount = useMemo(() => conversations.filter(isSystemConversation).length, [conversations]);

    const scoped = useMemo(
        () => (showSystem ? conversations : conversations.filter((c) => !isSystemConversation(c))),
        [conversations, showSystem]
    );

    const channelOptions = useMemo(() => {
        const seen = new Map<string, number>();
        for (const c of scoped) seen.set(c.channelType, (seen.get(c.channelType) ?? 0) + 1);
        return Array.from(seen.entries())
            .sort((a, b) => humanizeChannel(a[0]).localeCompare(humanizeChannel(b[0])))
            .map(([value, count]) => ({ value, label: humanizeChannel(value), count }));
    }, [scoped]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return scoped.filter((c) => {
            if (channelFilter !== "all" && c.channelType !== channelFilter) return false;
            if (!q) return true;
            const haystack = (c.contactName || c.channelContactId || "").toLowerCase();
            return haystack.includes(q);
        });
    }, [scoped, channelFilter, search]);

    const allSystemHidden = !showSystem && scoped.length === 0 && conversations.length > 0;

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-6xl mx-auto">
            <PageHeader
                title="Conversations"
                description="Every conversation thread with your contacts, across every channel."
            />

            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <div className="relative flex-1 min-w-0 sm:max-w-xs">
                    <MagnifyingGlassIcon
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pulse-faint pointer-events-none"
                        aria-hidden="true"
                    />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search contacts…"
                        aria-label="Search conversations by contact name"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text placeholder-pulse-faint outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by channel">
                    <button
                        type="button"
                        onClick={() => setChannelFilter("all")}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                            channelFilter === "all"
                                ? "bg-indigo-600 border-indigo-600 text-white"
                                : "bg-pulse-panel border-pulse-border text-pulse-muted hover:text-pulse-text hover:border-pulse-border-strong"
                        }`}
                        aria-pressed={channelFilter === "all"}
                    >
                        All
                    </button>
                    {channelOptions.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => setChannelFilter(opt.value)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                                channelFilter === opt.value
                                    ? "bg-indigo-600 border-indigo-600 text-white"
                                    : "bg-pulse-panel border-pulse-border text-pulse-muted hover:text-pulse-text hover:border-pulse-border-strong"
                            }`}
                            aria-pressed={channelFilter === opt.value}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {systemCount > 0 && (
                    <label className="flex items-center gap-2 sm:ml-auto cursor-pointer select-none">
                        <span className="text-xs text-pulse-muted whitespace-nowrap">
                            Show system conversations
                            <span className="text-pulse-faint"> ({systemCount})</span>
                        </span>
                        <Toggle checked={showSystem} onChange={setShowSystem} label="Show system conversations" />
                    </label>
                )}
            </div>

            <Card>
                {conversations.length === 0 ? (
                    <EmptyState
                        icon={InboxIcon}
                        title="No conversations yet"
                        description="Messages will appear here once contacts interact with your agents."
                    />
                ) : filtered.length === 0 ? (
                    allSystemHidden ? (
                        <EmptyState
                            icon={CommandLineIcon}
                            title="Only system conversations so far"
                            description="These are internal Codex/MCP sessions, hidden by default."
                            action={
                                <button
                                    type="button"
                                    onClick={() => setShowSystem(true)}
                                    className="text-sm font-medium text-indigo-500 hover:text-indigo-400 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md"
                                >
                                    Show system conversations
                                </button>
                            }
                        />
                    ) : (
                        <EmptyState
                            icon={MagnifyingGlassIcon}
                            title="No matching conversations"
                            description="Try a different search term or channel filter."
                            action={
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearch("");
                                        setChannelFilter("all");
                                    }}
                                    className="text-sm font-medium text-indigo-500 hover:text-indigo-400 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md"
                                >
                                    Clear filters
                                </button>
                            }
                        />
                    )
                ) : (
                    <ul className="divide-y divide-pulse-border-subtle">
                        {filtered.map((c) => {
                            const system = isSystemConversation(c);
                            return (
                                <li key={c.id}>
                                    <Link
                                        href={`/dashboard/conversations/${c.id}`}
                                        title={c.channelContactId}
                                        className="flex items-center gap-4 px-5 py-3.5 hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                                    >
                                        <AgentAvatar name={c.contactName || "?"} size="md" />

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-pulse-text truncate">
                                                    {c.contactName || "Unknown contact"}
                                                </p>
                                                {system && (
                                                    <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-pulse-panel-alt text-pulse-faint border border-pulse-border-subtle">
                                                        System
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-pulse-muted truncate mt-0.5">
                                                {secondaryChannelLabel(c)} · {relativeTime(c.updatedAt)}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-3 flex-shrink-0">
                                            <ChannelChip channelType={c.channelType} />
                                            {c.messageCount > 0 && (
                                                <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full text-xs font-medium bg-pulse-panel-alt text-pulse-muted border border-pulse-border-subtle">
                                                    {c.messageCount}
                                                </span>
                                            )}
                                            <StatusDot status={c.status} />
                                            <span className="hidden md:inline text-xs text-pulse-faint whitespace-nowrap w-16 text-right">
                                                {relativeTime(c.updatedAt)}
                                            </span>
                                        </div>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Card>
        </div>
    );
}
