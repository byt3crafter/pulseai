"use client";

import Link from "next/link";
import {
    ChatBubbleLeftRightIcon,
    CommandLineIcon,
    EnvelopeIcon,
    GlobeAltIcon,
} from "@heroicons/react/24/outline";
import AgentAvatar from "../../../../components/dashboard/AgentAvatar";
import { relativeTime, secondaryChannelLabel } from "../utils";

interface Message {
    id: string;
    role: string;
    content: string;
    metadata: unknown;
    createdAt: string;
}

interface ConversationInfo {
    id: string;
    channelType: string;
    channelContactId: string;
    contactName: string | null;
    status: string | null;
    createdAt: string;
    updatedAt?: string;
    messageCount?: number;
}

/** Icon + accent color per channel — mirrors ConversationsClient.tsx so the chip reads the same everywhere. */
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

function roleStyling(role: string) {
    switch (role) {
        case "user":
            return "bg-indigo-600 text-white ml-12 text-right";
        case "assistant":
            return "bg-pulse-panel-alt border border-pulse-border-subtle text-pulse-text mr-12";
        case "tool":
            return "bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs mr-12";
        case "system":
            return "bg-pulse-panel-alt border border-pulse-border-subtle text-pulse-muted italic text-center mx-16 text-xs";
        default:
            return "bg-pulse-panel-alt text-pulse-text-soft mr-12";
    }
}

function roleLabel(role: string) {
    switch (role) {
        case "user":
            return "User";
        case "assistant":
            return "Assistant";
        case "tool":
            return "Tool";
        case "system":
            return "System";
        default:
            return role;
    }
}

export default function ConversationDetailClient({
    conversation,
    messages,
}: {
    conversation: ConversationInfo;
    messages: Message[];
}) {
    const meta = channelMeta(conversation.channelType);
    const Icon = meta.icon;
    const active = conversation.status === "active";
    const lastActive = conversation.updatedAt || messages[messages.length - 1]?.createdAt || conversation.createdAt;

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            {/* Header */}
            <div className="mb-6">
                <Link
                    href="/dashboard/conversations"
                    className="text-sm text-pulse-muted hover:text-pulse-text transition-colors motion-reduce:transition-none mb-3 inline-block cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md"
                >
                    &larr; Back to Conversations
                </Link>
                <div className="flex items-center gap-3" title={conversation.channelContactId}>
                    <AgentAvatar name={conversation.contactName || "?"} size="lg" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-semibold text-pulse-text truncate">
                            {conversation.contactName || "Unknown contact"}
                        </h1>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.bg} ${meta.text} ${meta.border}`}
                            >
                                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                                {secondaryChannelLabel(conversation)}
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-pulse-panel-alt text-pulse-muted border border-pulse-border-subtle">
                                <span
                                    className={`inline-block w-1.5 h-1.5 rounded-full ${active ? "bg-green-500" : "bg-pulse-border-strong"}`}
                                    aria-hidden="true"
                                />
                                {conversation.status || "unknown"}
                            </span>
                            {typeof conversation.messageCount === "number" && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-pulse-panel-alt text-pulse-muted border border-pulse-border-subtle">
                                    {conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"}
                                </span>
                            )}
                            <span className="text-xs text-pulse-faint">
                                Active {relativeTime(lastActive)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Message Thread */}
            <div className="space-y-3">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`rounded-xl px-5 py-3 ${roleStyling(msg.role)}`}
                    >
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold uppercase tracking-wide opacity-80">
                                {roleLabel(msg.role)}
                            </span>
                            <span className="text-xs opacity-70">
                                {msg.createdAt
                                    ? new Date(msg.createdAt).toLocaleString()
                                    : ""}
                            </span>
                        </div>
                        <div className="text-sm whitespace-pre-wrap leading-relaxed">
                            {msg.content}
                        </div>
                    </div>
                ))}
                {messages.length === 0 && (
                    <div className="text-center py-12 text-sm text-pulse-faint">
                        No messages in this conversation yet.
                    </div>
                )}
            </div>
        </div>
    );
}
