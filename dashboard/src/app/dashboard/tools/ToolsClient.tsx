"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PlusIcon, TrashIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { deleteCustomToolAction, toggleCustomToolAction } from "./actions";
import { PageHeader, Card } from "../../../components/dashboard/ui";

type Param = { name: string; type: string; description: string; required: boolean };
type Agent = { id: string; name: string };
type Tool = {
    id: string; name: string; description: string; method: string;
    urlTemplate: string; bodyTemplate: string; timeoutMs: number; enabled: boolean;
    headers: Record<string, string>; params: Param[]; allowedAgentIds: string[];
};

export default function ToolsClient({ tools, agents }: { tools: Tool[]; agents: Agent[] }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const run = (action: (fd: FormData) => Promise<{ success: boolean; message: string }>, fd: FormData) => {
        startTransition(async () => {
            const res = await action(fd);
            setMsg({ ok: res.success, text: res.message });
            router.refresh();
        });
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
            <PageHeader
                title="Custom Tools"
                description="Connect your own API or software. Each tool becomes an action your agents can call — define the request once, and the AI fills in the parameters. Secrets (auth headers) are encrypted at rest."
                action={
                    <Link
                        href="/dashboard/tools/new"
                        className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 self-start sm:self-auto"
                    >
                        <PlusIcon className="h-4 w-4" aria-hidden="true" /> New tool
                    </Link>
                }
            />

            {msg && (
                <div className={`mb-4 rounded-lg px-4 py-2 text-sm border ${msg.ok ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
                    {msg.text}
                </div>
            )}

            <div className="space-y-3">
                {tools.length === 0 && (
                    <p className="text-pulse-faint text-sm text-center py-10">No custom tools yet. Create one to connect your software.</p>
                )}
                {tools.map((t) => (
                    <Card key={t.id} className="p-4 flex flex-col sm:flex-row items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <code className="text-sm font-semibold text-pulse-text">{t.name}</code>
                                <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-pulse-panel-alt text-pulse-muted">{t.method}</span>
                                {!t.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">Disabled</span>}
                            </div>
                            <p className="text-sm text-pulse-text-soft mt-1">{t.description}</p>
                            <p className="text-xs text-pulse-faint mt-1 truncate font-mono">{t.urlTemplate}</p>
                            {t.params.length > 0 && (
                                <p className="text-xs text-pulse-faint mt-1">params: {t.params.map((p) => p.name).join(", ")}</p>
                            )}
                            <p className="text-xs text-pulse-faint mt-1">
                                {t.allowedAgentIds.length > 0 ? `scoped to ${t.allowedAgentIds.length} agent${t.allowedAgentIds.length > 1 ? "s" : ""}` : "available to all agents"}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => { const fd = new FormData(); fd.set("toolId", t.id); fd.set("enabled", String(!t.enabled)); run(toggleCustomToolAction, fd); }}
                                className="text-xs text-pulse-muted hover:text-pulse-text disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md px-1"
                                disabled={pending}
                            >{t.enabled ? "Disable" : "Enable"}</button>
                            <Link
                                href={`/dashboard/tools/${t.id}/edit`}
                                className="p-1.5 rounded-md text-pulse-faint hover:text-indigo-500 hover:bg-pulse-tint transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                title="Edit"
                                aria-label={`Edit ${t.name}`}
                            >
                                <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
                            </Link>
                            <button
                                type="button"
                                onClick={() => { if (!confirm(`Delete "${t.name}"?`)) return; const fd = new FormData(); fd.set("toolId", t.id); run(deleteCustomToolAction, fd); }}
                                className="p-1.5 rounded-md text-pulse-faint hover:text-red-400 hover:bg-red-500/10 transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                title="Delete"
                                aria-label={`Delete ${t.name}`}
                                disabled={pending}
                            ><TrashIcon className="h-4 w-4" aria-hidden="true" /></button>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}
