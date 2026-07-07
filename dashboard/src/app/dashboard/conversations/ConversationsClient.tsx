"use client";

import Link from "next/link";

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

const channelBadge: Record<string, { bg: string; text: string }> = {
    telegram: { bg: "bg-blue-500/10", text: "text-blue-400" },
    whatsapp: { bg: "bg-green-500/10", text: "text-green-400" },
    webchat: { bg: "bg-purple-500/10", text: "text-purple-400" },
};

export default function ConversationsClient({
    conversations,
}: {
    conversations: Conversation[];
}) {
    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-pulse-text tracking-tight">
                    Conversations
                </h1>
                <p className="text-sm text-pulse-muted mt-1">
                    View all conversation threads with your contacts across channels.
                </p>
            </div>

            <div className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-pulse-panel-alt text-pulse-faint text-xs uppercase tracking-wider border-b border-pulse-border-subtle">
                                <th className="px-6 py-4 font-medium">Contact</th>
                                <th className="px-6 py-4 font-medium">Channel</th>
                                <th className="px-6 py-4 font-medium">Messages</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium">Last Updated</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-pulse-border-subtle">
                            {conversations.map((c) => {
                                const badge = channelBadge[c.channelType] ?? {
                                    bg: "bg-pulse-panel-alt",
                                    text: "text-pulse-text-soft",
                                };
                                return (
                                    <tr
                                        key={c.id}
                                        className="hover:bg-pulse-panel-alt transition-colors motion-reduce:transition-none"
                                    >
                                        <td className="px-6 py-4">
                                            <Link
                                                href={`/dashboard/conversations/${c.id}`}
                                                className="block cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md"
                                            >
                                                <div className="font-medium text-indigo-500 hover:text-indigo-400">
                                                    {c.contactName || c.channelContactId}
                                                </div>
                                                {c.contactName && (
                                                    <div className="text-xs text-pulse-faint font-mono mt-0.5">
                                                        {c.channelContactId}
                                                    </div>
                                                )}
                                            </Link>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${badge.bg} ${badge.text}`}
                                            >
                                                {c.channelType}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-pulse-muted font-medium">
                                            {c.messageCount}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                                                    c.status === "active"
                                                        ? "bg-green-500/10 text-green-400"
                                                        : "bg-pulse-panel-alt text-pulse-muted"
                                                }`}
                                            >
                                                {c.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-pulse-muted">
                                            {c.updatedAt
                                                ? new Date(c.updatedAt).toLocaleString()
                                                : "—"}
                                        </td>
                                    </tr>
                                );
                            })}
                            {conversations.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-6 py-12 text-center text-sm text-pulse-faint"
                                    >
                                        No conversations yet. Messages will appear here once
                                        contacts interact with your agents.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
