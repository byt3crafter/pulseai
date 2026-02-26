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
    telegram: { bg: "bg-blue-100", text: "text-blue-800" },
    whatsapp: { bg: "bg-green-100", text: "text-green-800" },
    webchat: { bg: "bg-purple-100", text: "text-purple-800" },
};

export default function ConversationsClient({
    conversations,
}: {
    conversations: Conversation[];
}) {
    return (
        <div className="p-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    Conversations
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                    View all conversation threads with your contacts across channels.
                </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                            <th className="px-6 py-4 font-medium">Contact</th>
                            <th className="px-6 py-4 font-medium">Channel</th>
                            <th className="px-6 py-4 font-medium">Messages</th>
                            <th className="px-6 py-4 font-medium">Status</th>
                            <th className="px-6 py-4 font-medium">Last Updated</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {conversations.map((c) => {
                            const badge = channelBadge[c.channelType] ?? {
                                bg: "bg-slate-100",
                                text: "text-slate-800",
                            };
                            return (
                                <tr
                                    key={c.id}
                                    className="hover:bg-slate-50 transition-colors"
                                >
                                    <td className="px-6 py-4">
                                        <Link
                                            href={`/dashboard/conversations/${c.id}`}
                                            className="block"
                                        >
                                            <div className="font-medium text-indigo-600 hover:text-indigo-700">
                                                {c.contactName || c.channelContactId}
                                            </div>
                                            {c.contactName && (
                                                <div className="text-xs text-slate-400 font-mono mt-0.5">
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
                                    <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                                        {c.messageCount}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                                                c.status === "active"
                                                    ? "bg-green-100 text-green-800"
                                                    : "bg-slate-100 text-slate-600"
                                            }`}
                                        >
                                            {c.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500">
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
                                    className="px-6 py-12 text-center text-sm text-slate-400"
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
    );
}
