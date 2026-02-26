"use client";

import { useState } from "react";
import Link from "next/link";

interface Conversation {
    id: string;
    tenantId: string;
    tenantName: string;
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

export default function AdminConversationsClient({
    conversations,
    tenantNames,
}: {
    conversations: Conversation[];
    tenantNames: string[];
}) {
    const [filterTenant, setFilterTenant] = useState<string>("all");

    const filtered =
        filterTenant === "all"
            ? conversations
            : conversations.filter((c) => c.tenantName === filterTenant);

    return (
        <div className="p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                        All Conversations
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Cross-tenant view of all conversation threads.
                    </p>
                </div>

                <select
                    value={filterTenant}
                    onChange={(e) => setFilterTenant(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                >
                    <option value="all">All Tenants</option>
                    {tenantNames.map((name) => (
                        <option key={name} value={name}>
                            {name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
                            <th className="px-6 py-4 font-medium">Tenant</th>
                            <th className="px-6 py-4 font-medium">Contact</th>
                            <th className="px-6 py-4 font-medium">Channel</th>
                            <th className="px-6 py-4 font-medium">Messages</th>
                            <th className="px-6 py-4 font-medium">Status</th>
                            <th className="px-6 py-4 font-medium">
                                Last Updated
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {filtered.map((c) => {
                            const badge = channelBadge[c.channelType] ?? {
                                bg: "bg-gray-100",
                                text: "text-gray-800",
                            };
                            return (
                                <tr
                                    key={c.id}
                                    className="hover:bg-gray-50 transition-colors"
                                >
                                    <td className="px-6 py-4 text-sm font-medium text-gray-700">
                                        {c.tenantName}
                                    </td>
                                    <td className="px-6 py-4">
                                        <Link
                                            href={`/admin/conversations/${c.id}`}
                                            className="block"
                                        >
                                            <div className="font-medium text-indigo-600 hover:text-indigo-700">
                                                {c.contactName ||
                                                    c.channelContactId}
                                            </div>
                                            {c.contactName && (
                                                <div className="text-xs text-gray-400 font-mono mt-0.5">
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
                                    <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                                        {c.messageCount}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                                                c.status === "active"
                                                    ? "bg-green-100 text-green-800"
                                                    : "bg-gray-100 text-gray-600"
                                            }`}
                                        >
                                            {c.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {c.updatedAt
                                            ? new Date(
                                                  c.updatedAt
                                              ).toLocaleString()
                                            : "—"}
                                    </td>
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && (
                            <tr>
                                <td
                                    colSpan={6}
                                    className="px-6 py-12 text-center text-sm text-gray-400"
                                >
                                    No conversations found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
