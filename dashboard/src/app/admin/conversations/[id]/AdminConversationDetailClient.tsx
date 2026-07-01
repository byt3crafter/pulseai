"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ui, PageHeader, Panel, Badge } from "../../../../components/admin/ui";

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
    tenantName: string;
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

function roleStyling(role: string) {
    switch (role) {
        case "user":
            return "bg-[#141417] text-[#EDEDED] ml-12";
        case "assistant":
            return "bg-[#101012] border border-[#242429] text-[#EDEDED] mr-12";
        case "tool":
            return "bg-[#8B5CF6]/10 border border-[#8B5CF6]/40 text-[#8B5CF6] font-sans text-xs mr-12";
        case "system":
            return "bg-[#101012] border border-[#242429] text-[#8A8A90] italic text-center mx-16 text-xs";
        default:
            return "bg-[#101012] text-[#B5B5BA] mr-12";
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

/** Group messages by date string (e.g., "Mon, Jan 6, 2025") */
function groupByDate(messages: Message[]) {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = "";

    for (const msg of messages) {
        const d = msg.createdAt
            ? new Date(msg.createdAt).toLocaleDateString("en-US", {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
              })
            : "Unknown";

        if (d !== currentDate) {
            currentDate = d;
            groups.push({ date: d, messages: [msg] });
        } else {
            groups[groups.length - 1].messages.push(msg);
        }
    }

    return groups;
}

/** Render markdown-like content to JSX */
function MarkdownContent({ content }: { content: string }) {
    const lines = content.split("\n");
    const elements: React.ReactElement[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Fenced code blocks
        if (line.trimStart().startsWith("```")) {
            const lang = line.trimStart().slice(3).trim();
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
                codeLines.push(lines[i]);
                i++;
            }
            i++; // skip closing ```
            elements.push(
                <pre key={`code-${i}`} className="bg-[#050506] text-[#EDEDED] rounded-lg p-4 overflow-x-auto text-xs my-2">
                    {lang && <div className="text-xs text-[#5A5A61] mb-2">{lang}</div>}
                    <code>{codeLines.join("\n")}</code>
                </pre>
            );
            continue;
        }

        // Headings
        if (line.startsWith("### ")) {
            elements.push(<h3 key={`h3-${i}`} className="text-sm font-bold mt-3 mb-1">{renderInline(line.slice(4))}</h3>);
            i++;
            continue;
        }
        if (line.startsWith("## ")) {
            elements.push(<h2 key={`h2-${i}`} className="text-base font-bold mt-3 mb-1">{renderInline(line.slice(3))}</h2>);
            i++;
            continue;
        }
        if (line.startsWith("# ")) {
            elements.push(<h1 key={`h1-${i}`} className="text-lg font-bold mt-3 mb-1">{renderInline(line.slice(2))}</h1>);
            i++;
            continue;
        }

        // Unordered list items
        if (/^[\s]*[-*]\s/.test(line)) {
            const listItems: string[] = [];
            while (i < lines.length && /^[\s]*[-*]\s/.test(lines[i])) {
                listItems.push(lines[i].replace(/^[\s]*[-*]\s/, ""));
                i++;
            }
            elements.push(
                <ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 my-1">
                    {listItems.map((item, j) => (
                        <li key={j}>{renderInline(item)}</li>
                    ))}
                </ul>
            );
            continue;
        }

        // Ordered list items
        if (/^\s*\d+\.\s/.test(line)) {
            const listItems: string[] = [];
            while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
                listItems.push(lines[i].replace(/^\s*\d+\.\s/, ""));
                i++;
            }
            elements.push(
                <ol key={`ol-${i}`} className="list-decimal list-inside space-y-0.5 my-1">
                    {listItems.map((item, j) => (
                        <li key={j}>{renderInline(item)}</li>
                    ))}
                </ol>
            );
            continue;
        }

        // Empty line = paragraph break
        if (line.trim() === "") {
            elements.push(<div key={`br-${i}`} className="h-2" />);
            i++;
            continue;
        }

        // Regular paragraph
        elements.push(<p key={`p-${i}`} className="my-0.5">{renderInline(line)}</p>);
        i++;
    }

    return <div className="text-sm leading-relaxed">{elements}</div>;
}

/** Render inline markdown: bold, italic, code, links */
function renderInline(text: string): (string | React.ReactElement)[] {
    const parts: (string | React.ReactElement)[] = [];
    // Pattern: inline code, bold, italic, links
    const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        const m = match[0];
        if (m.startsWith("`")) {
            parts.push(
                <code key={key++} className="bg-[#141417] text-[#EDEDED] px-1.5 py-0.5 rounded text-xs font-sans">
                    {m.slice(1, -1)}
                </code>
            );
        } else if (m.startsWith("**")) {
            parts.push(<strong key={key++}>{m.slice(2, -2)}</strong>);
        } else if (m.startsWith("*")) {
            parts.push(<em key={key++}>{m.slice(1, -1)}</em>);
        } else if (m.startsWith("[")) {
            const linkMatch = m.match(/\[([^\]]+)\]\(([^)]+)\)/);
            if (linkMatch) {
                parts.push(
                    <a key={key++} href={linkMatch[2]} className="text-[#8B5CF6] hover:underline" target="_blank" rel="noopener noreferrer">
                        {linkMatch[1]}
                    </a>
                );
            }
        }

        lastIndex = match.index + m.length;
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [text];
}

export default function AdminConversationDetailClient({
    conversation,
    messages,
}: {
    conversation: ConversationInfo;
    messages: Message[];
}) {
    const dateGroups = groupByDate(messages);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const toggleDate = (date: string) => {
        setCollapsed((prev) => ({ ...prev, [date]: !prev[date] }));
    };

    return (
        <div className={ui.page}>
            <Link
                href="/admin/conversations"
                className="text-[13px] text-[#8A8A90] hover:text-[#B5B5BA] transition-colors inline-block"
            >
                &larr; Back to Conversations
            </Link>

            <PageHeader
                title={conversation.contactName || conversation.channelContactId}
                subtitle={`${conversation.tenantName} · ${conversation.channelContactId}`}
                action={
                    <div className="flex items-center gap-2">
                        <ChannelBadge channelType={conversation.channelType} />
                        <Badge variant={conversation.status === "active" ? "success" : "neutral"}>
                            {conversation.status}
                        </Badge>
                    </div>
                }
            />

            {/* Message Thread — grouped by date */}
            <Panel label="Message Thread" meta={`${messages.length} messages`}>
                <div className="space-y-4">
                    {dateGroups.map((group) => (
                        <div key={group.date}>
                            {/* Date header */}
                            <button
                                onClick={() => toggleDate(group.date)}
                                className="flex items-center gap-3 w-full py-2 group"
                            >
                                <div className="h-px flex-1 bg-[#242429]" />
                                <span className="text-xs font-medium text-[#5A5A61] group-hover:text-[#B5B5BA] transition-colors flex items-center gap-1.5">
                                    <svg className={`w-3 h-3 transition-transform ${collapsed[group.date] ? "-rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                    </svg>
                                    {group.date}
                                    <span className="text-[#5A5A61]">({group.messages.length})</span>
                                </span>
                                <div className="h-px flex-1 bg-[#242429]" />
                            </button>

                            {/* Messages within date */}
                            {!collapsed[group.date] && (
                                <div className="space-y-3">
                                    {group.messages.map((msg) => (
                                        <div
                                            key={msg.id}
                                            className={`rounded-lg px-5 py-3 ${roleStyling(msg.role)}`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-semibold text-[#8A8A90] uppercase tracking-wide">
                                                    {roleLabel(msg.role)}
                                                </span>
                                                <span className="text-xs text-[#5A5A61]">
                                                    {msg.createdAt
                                                        ? new Date(msg.createdAt).toLocaleTimeString()
                                                        : ""}
                                                </span>
                                            </div>
                                            {msg.role === "tool" ? (
                                                <pre className="text-xs whitespace-pre-wrap">{msg.content}</pre>
                                            ) : (
                                                <MarkdownContent content={msg.content} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                    {messages.length === 0 && (
                        <div className="text-center py-12 text-[13px] text-[#5A5A61]">
                            No messages in this conversation.
                        </div>
                    )}
                </div>
            </Panel>
        </div>
    );
}
