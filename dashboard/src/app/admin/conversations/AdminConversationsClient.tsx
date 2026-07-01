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
    telegram: { bg: "bg-[#3B82F6]/10 border border-[#3B82F6]/40", text: "text-[#3B82F6]" },
    whatsapp: { bg: "bg-[#3FB950]/10 border border-[#3FB950]/40", text: "text-[#3FB950]" },
    webchat: { bg: "bg-[#A78BFA]/10 border border-[#A78BFA]/40", text: "text-[#A78BFA]" },
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
                    <h1 className="text-2xl font-bold text-[#EDEDED] tracking-tight">
                        All Conversations
                    </h1>
                    <p className="text-sm text-[#8A8A90] mt-1">
                        Cross-tenant view of all conversation threads.
                    </p>
                </div>

                <select
                    value={filterTenant}
                    onChange={(e) => setFilterTenant(e.target.value)}
                    className="px-3 py-2 border border-[#242429] rounded-lg text-sm focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] outline-none bg-[#101012] text-[#EDEDED]"
                >
                    <option value="all">All Tenants</option>
                    {tenantNames.map((name) => (
                        <option key={name} value={name}>
                            {name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="bg-[#0C0C0E] rounded-xl border border-[#242429]">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-[#101012] text-[#5A5A61] text-xs uppercase tracking-wider border-b border-[#242429]">
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
                    <tbody className="divide-y divide-[#1C1C1F]">
                        {filtered.map((c) => {
                            const badge = channelBadge[c.channelType] ?? {
                                bg: "bg-[#141417] border border-[#242429]",
                                text: "text-[#8A8A90]",
                            };
                            return (
                                <tr
                                    key={c.id}
                                    className="hover:bg-[#101012] transition-colors"
                                >
                                    <td className="px-6 py-4 text-sm font-medium text-[#B5B5BA]">
                                        {c.tenantName}
                                    </td>
                                    <td className="px-6 py-4">
                                        <Link
                                            href={`/admin/conversations/${c.id}`}
                                            className="block"
                                        >
                                            <div className="font-medium text-[#8B5CF6] hover:text-[#A78BFA]">
                                                {c.contactName ||
                                                    c.channelContactId}
                                            </div>
                                            {c.contactName && (
                                                <div className="text-xs text-[#5A5A61] font-sans mt-0.5">
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
                                    <td className="px-6 py-4 text-sm text-[#B5B5BA] font-medium">
                                        {c.messageCount}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                                                c.status === "active"
                                                    ? "bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/40"
                                                    : "bg-[#141417] text-[#8A8A90] border border-[#242429]"
                                            }`}
                                        >
                                            {c.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-[#8A8A90]">
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
                                    className="px-6 py-12 text-center text-sm text-[#5A5A61]"
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
