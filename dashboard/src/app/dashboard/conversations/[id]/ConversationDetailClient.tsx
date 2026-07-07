"use client";

import Link from "next/link";

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
}

const channelBadge: Record<string, { bg: string; text: string }> = {
    telegram: { bg: "bg-blue-500/10", text: "text-blue-400" },
    whatsapp: { bg: "bg-green-500/10", text: "text-green-400" },
    webchat: { bg: "bg-purple-500/10", text: "text-purple-400" },
};

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
    const badge = channelBadge[conversation.channelType] ?? {
        bg: "bg-pulse-panel-alt",
        text: "text-pulse-text-soft",
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            {/* Header */}
            <div className="mb-6">
                <Link
                    href="/dashboard/conversations"
                    className="text-sm text-pulse-muted hover:text-pulse-text transition-colors motion-reduce:transition-none mb-2 inline-block cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md"
                >
                    &larr; Back to Conversations
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-pulse-text">
                            {conversation.contactName ||
                                conversation.channelContactId}
                        </h1>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs font-mono text-pulse-faint">
                                {conversation.channelContactId}
                            </span>
                            <span
                                className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${badge.bg} ${badge.text}`}
                            >
                                {conversation.channelType}
                            </span>
                            <span
                                className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${
                                    conversation.status === "active"
                                        ? "bg-green-500/10 text-green-400"
                                        : "bg-pulse-panel-alt text-pulse-muted"
                                }`}
                            >
                                {conversation.status}
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
