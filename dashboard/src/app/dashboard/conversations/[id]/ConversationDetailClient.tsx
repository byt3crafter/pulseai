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
    telegram: { bg: "bg-blue-100", text: "text-blue-800" },
    whatsapp: { bg: "bg-green-100", text: "text-green-800" },
    webchat: { bg: "bg-purple-100", text: "text-purple-800" },
};

function roleStyling(role: string) {
    switch (role) {
        case "user":
            return "bg-indigo-50 text-slate-800 ml-12 text-right";
        case "assistant":
            return "bg-white border border-slate-200 text-slate-800 mr-12";
        case "tool":
            return "bg-amber-50 border border-amber-200 text-amber-900 font-mono text-xs mr-12";
        case "system":
            return "bg-slate-50 border border-slate-200 text-slate-500 italic text-center mx-16 text-xs";
        default:
            return "bg-slate-50 text-slate-700 mr-12";
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
        bg: "bg-slate-100",
        text: "text-slate-800",
    };

    return (
        <div className="p-8">
            {/* Header */}
            <div className="mb-6">
                <Link
                    href="/dashboard/conversations"
                    className="text-sm text-slate-500 hover:text-slate-700 transition-colors mb-2 inline-block"
                >
                    &larr; Back to Conversations
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">
                            {conversation.contactName ||
                                conversation.channelContactId}
                        </h1>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs font-mono text-slate-400">
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
                                        ? "bg-green-100 text-green-800"
                                        : "bg-slate-100 text-slate-600"
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
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                {roleLabel(msg.role)}
                            </span>
                            <span className="text-xs text-slate-400">
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
                    <div className="text-center py-12 text-sm text-slate-400">
                        No messages in this conversation yet.
                    </div>
                )}
            </div>
        </div>
    );
}
