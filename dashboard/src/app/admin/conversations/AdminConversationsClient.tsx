"use client";

import { useState } from "react";
import Link from "next/link";
import { ui, PageHeader, Panel, Badge } from "../../../components/admin/ui";

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

const channelBadge: Record<string, string> = {
    telegram: "bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/30",
    whatsapp: "bg-[#3FB950]/10 text-[#3FB950] border-[#3FB950]/30",
    webchat: "bg-[#A78BFA]/10 text-[#A78BFA] border-[#A78BFA]/30",
};

function ChannelBadge({ channelType }: { channelType: string }) {
    const cls = channelBadge[channelType] ?? "bg-[#141417] text-[#8A8A90] border-[#242429]";
    return (
        <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium capitalize ${cls}`}>
            {channelType}
        </span>
    );
}

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
        <div className={ui.page}>
            <PageHeader
                title="Conversations"
                subtitle="Cross-tenant view of all conversation threads."
                action={
                    <select
                        value={filterTenant}
                        onChange={(e) => setFilterTenant(e.target.value)}
                        className={`${ui.input} w-auto`}
                    >
                        <option value="all">All Tenants</option>
                        {tenantNames.map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                }
            />

            <Panel bodyClassName="p-0">
                <div className="overflow-x-auto">
                    <table className={ui.table}>
                        <thead>
                            <tr>
                                <th className={ui.th}>Tenant</th>
                                <th className={ui.th}>Contact</th>
                                <th className={ui.th}>Channel</th>
                                <th className={ui.thRight}>Messages</th>
                                <th className={ui.th}>Status</th>
                                <th className={ui.th}>Last Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((c) => (
                                <tr key={c.id} className={ui.row}>
                                    <td className={ui.td}>{c.tenantName}</td>
                                    <td className={ui.td}>
                                        <Link href={`/admin/conversations/${c.id}`} className="block">
                                            <div className="font-medium text-[#8B5CF6] hover:text-[#A78BFA]">
                                                {c.contactName || c.channelContactId}
                                            </div>
                                            {c.contactName && (
                                                <div className="text-[11px] text-[#5A5A61] mt-0.5">
                                                    {c.channelContactId}
                                                </div>
                                            )}
                                        </Link>
                                    </td>
                                    <td className={ui.td}>
                                        <ChannelBadge channelType={c.channelType} />
                                    </td>
                                    <td className={ui.tdRight}>{c.messageCount}</td>
                                    <td className={ui.td}>
                                        <Badge variant={c.status === "active" ? "success" : "neutral"}>
                                            {c.status}
                                        </Badge>
                                    </td>
                                    <td className={ui.tdMuted}>
                                        {c.updatedAt ? new Date(c.updatedAt).toLocaleString() : "—"}
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-[13px] text-[#5A5A61]">
                                        No conversations found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Panel>
        </div>
    );
}
